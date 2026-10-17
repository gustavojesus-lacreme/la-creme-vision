CREATE TABLE public.whatsapp_outbound_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 appointment_id uuid NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sending','accepted','sent','delivered','read','failed','unresolved')),
 blocked_reason text DEFAULT 'awaiting_connection',
 provider_message_id text UNIQUE,
 attempts integer NOT NULL DEFAULT 0,
 last_attempt_at timestamptz,
 error_code text,
 accepted_at timestamptz, sent_at timestamptz, delivered_at timestamptz, read_at timestamptz, failed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.whatsapp_outbound_messages TO authenticated;
GRANT ALL ON public.whatsapp_outbound_messages TO service_role;
ALTER TABLE public.whatsapp_outbound_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY whatsapp_outbound_admin_read ON public.whatsapp_outbound_messages FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.whatsapp_webhook_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), delivery_id text NOT NULL UNIQUE CHECK(length(delivery_id)>0),
 event text NOT NULL CHECK(length(event)>0), payload jsonb NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz,
 processing_error text, next_attempt_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.whatsapp_webhook_events TO service_role;
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX whatsapp_events_pending ON public.whatsapp_webhook_events(next_attempt_at) WHERE processed_at IS NULL;

CREATE TABLE public.whatsapp_status_callbacks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES public.whatsapp_webhook_events(id) ON DELETE CASCADE,
 provider_message_id text NOT NULL, state text NOT NULL, provider_at timestamptz NOT NULL,
 errors jsonb, applied_at timestamptz,
 UNIQUE(event_id,provider_message_id,state,provider_at)
);
GRANT ALL ON public.whatsapp_status_callbacks TO service_role;
ALTER TABLE public.whatsapp_status_callbacks ENABLE ROW LEVEL SECURITY;
CREATE INDEX whatsapp_status_unmatched ON public.whatsapp_status_callbacks(provider_message_id) WHERE applied_at IS NULL;

CREATE FUNCTION public.enqueue_whatsapp_confirmation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.status='confirmado' THEN
  INSERT INTO public.whatsapp_outbound_messages(appointment_id) VALUES(NEW.id) ON CONFLICT(appointment_id) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_whatsapp_confirmation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER appointments_whatsapp_confirmation AFTER INSERT ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.enqueue_whatsapp_confirmation();

CREATE FUNCTION public.reconcile_whatsapp_status(_message_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record; m public.whatsapp_outbound_messages; rank_current integer; rank_next integer;
BEGIN
 SELECT * INTO m FROM public.whatsapp_outbound_messages WHERE provider_message_id=_message_id FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 FOR s IN SELECT * FROM public.whatsapp_status_callbacks WHERE provider_message_id=_message_id AND applied_at IS NULL ORDER BY provider_at,id FOR UPDATE LOOP
  rank_current:=CASE m.state WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 ELSE 0 END;
  rank_next:=CASE s.state WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 ELSE 0 END;
  UPDATE public.whatsapp_outbound_messages SET
   state=CASE WHEN rank_next>rank_current OR (s.state='failed' AND rank_current<2) THEN s.state ELSE state END,
   sent_at=CASE WHEN s.state='sent' THEN coalesce(sent_at,s.provider_at) ELSE sent_at END,
   delivered_at=CASE WHEN s.state='delivered' THEN coalesce(delivered_at,s.provider_at) ELSE delivered_at END,
   read_at=CASE WHEN s.state='read' THEN coalesce(read_at,s.provider_at) ELSE read_at END,
   failed_at=CASE WHEN s.state='failed' THEN coalesce(failed_at,s.provider_at) ELSE failed_at END,
   error_code=CASE WHEN s.state='failed' THEN coalesce(s.errors->0->>'code','provider_failed') ELSE error_code END
  WHERE id=m.id RETURNING * INTO m;
  UPDATE public.whatsapp_status_callbacks SET applied_at=now() WHERE id=s.id;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.reconcile_whatsapp_status(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_whatsapp_status(text) TO service_role;

CREATE FUNCTION public.recover_whatsapp_events() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e record; s jsonb; processed integer:=0;
BEGIN
 FOR e IN SELECT * FROM public.whatsapp_webhook_events WHERE processed_at IS NULL AND next_attempt_at<=now() ORDER BY next_attempt_at,received_at LIMIT 20 FOR UPDATE SKIP LOCKED LOOP
  BEGIN
   IF e.event='whatsapp.status' THEN
    FOR s IN SELECT value FROM jsonb_array_elements(coalesce(e.payload#>'{entry,0,changes,0,value,statuses}','[]'::jsonb)) LOOP
     IF coalesce(s->>'id','')='' OR s->>'status' NOT IN ('sent','delivered','read','failed') OR coalesce(s->>'timestamp','') !~ '^[0-9]{1,12}$' THEN RAISE EXCEPTION 'invalid_status_payload'; END IF;
     INSERT INTO public.whatsapp_status_callbacks(event_id,provider_message_id,state,provider_at,errors)
      VALUES(e.id,s->>'id',s->>'status',to_timestamp((s->>'timestamp')::double precision),s->'errors') ON CONFLICT DO NOTHING;
     PERFORM public.reconcile_whatsapp_status(s->>'id');
    END LOOP;
   END IF;
   UPDATE public.whatsapp_webhook_events SET processed_at=now(),processing_error=NULL WHERE id=e.id;
   processed:=processed+1;
  EXCEPTION WHEN OTHERS THEN
   UPDATE public.whatsapp_webhook_events SET processing_error='invalid_event_or_processing_failure',next_attempt_at=now()+interval '5 minutes' WHERE id=e.id;
  END;
 END LOOP;
 RETURN processed;
END $$;
REVOKE ALL ON FUNCTION public.recover_whatsapp_events() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recover_whatsapp_events() TO service_role;

CREATE FUNCTION public.whatsapp_reconcile_after_provider_id() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.provider_message_id IS NOT NULL AND NEW.provider_message_id IS DISTINCT FROM OLD.provider_message_id THEN PERFORM public.reconcile_whatsapp_status(NEW.provider_message_id); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.whatsapp_reconcile_after_provider_id() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER whatsapp_outbound_reconcile AFTER UPDATE OF provider_message_id ON public.whatsapp_outbound_messages FOR EACH ROW EXECUTE FUNCTION public.whatsapp_reconcile_after_provider_id();
COMMENT ON TABLE public.whatsapp_outbound_messages IS 'Preparation only: future confirmed appointments queued; sending remains blocked until connector, approved template, durable processor wake-up and real delivery test are configured. No historical backfill.';