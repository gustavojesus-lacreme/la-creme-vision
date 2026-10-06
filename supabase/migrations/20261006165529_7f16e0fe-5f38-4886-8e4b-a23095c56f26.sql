
INSERT INTO public.notification_settings (key, audience, label, enabled, sort_order)
VALUES ('barbeiro_ativado','barbeiro','Conta ativada pelo administrador', true, 99)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.notify_barber_pending()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NEW.approved_at IS NULL AND (TG_OP = 'INSERT' OR OLD.user_id IS NULL) THEN
    PERFORM public.notify_admins('admin_cadastro', 'cadastro', 'Novo barbeiro aguardando ativação',
      trim(NEW.name || ' ' || NEW.last_name) || ' concluiu o cadastro e aguarda ativação.', NULL, 'barber_pending:' || NEW.id || ':' || NEW.user_id);
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.user_id IS NOT NULL AND NEW.approved_at IS NOT NULL AND OLD.approved_at IS NULL THEN
    PERFORM public.notify(NEW.user_id, 'barbeiro_ativado', 'cadastro', 'Conta ativada',
      'O administrador ativou seu acesso. Sua agenda já está disponível no Painel.', NULL, 'barber_active:' || NEW.id || ':' || extract(epoch FROM NEW.approved_at)::bigint);
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.notify_barber_pending() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='barbers_notify_pending' AND tgtype & 16 = 16) THEN
    DROP TRIGGER IF EXISTS barbers_notify_pending ON public.barbers;
    CREATE TRIGGER barbers_notify_pending AFTER INSERT OR UPDATE ON public.barbers FOR EACH ROW EXECUTE FUNCTION public.notify_barber_pending();
  END IF;
END $$;

-- Reschedule title wording requested
CREATE OR REPLACE FUNCTION public.notify_appointment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE bu uuid; t text; cn text; k text;
BEGIN
  SELECT user_id INTO bu FROM public.barbers WHERE id = NEW.barber_id;
  t := public.appt_text(NEW);
  cn := trim(NEW.customer_first_name || ' ' || NEW.customer_last_name);
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify(NEW.user_id, 'cliente_criado', 'agendamento', 'Agendamento confirmado', t, NEW.id, 'criado:' || NEW.id);
    PERFORM public.notify(bu, 'barbeiro_novo', 'agendamento', 'Novo agendamento', cn || ' · ' || t, NEW.id, 'criado:' || NEW.id);
    IF bu IS NOT NULL AND auth.uid() = bu THEN
      PERFORM public.notify_admins('admin_eventos', 'encaixe', 'Encaixe / agendamento manual', cn || ' · ' || t, NEW.id, 'encaixe:' || NEW.id);
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status = 'cancelado' AND OLD.status <> 'cancelado' THEN
    PERFORM public.notify(NEW.user_id, 'cliente_cancelado', 'cancelamento', 'Agendamento cancelado', t, NEW.id, 'cancel:' || NEW.id);
    PERFORM public.notify(bu, 'barbeiro_cancelado', 'cancelamento', 'Agendamento cancelado', cn || ' · ' || t, NEW.id, 'cancel:' || NEW.id);
    PERFORM public.notify_admins('admin_alteracao', 'cancelamento', 'Agendamento cancelado', cn || ' · ' || t, NEW.id, 'cancel:' || NEW.id);
  ELSIF NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.barber_id IS DISTINCT FROM OLD.barber_id THEN
    k := 'resched:' || NEW.id || ':' || extract(epoch FROM NEW.starts_at)::bigint || ':' || NEW.barber_id;
    PERFORM public.notify(NEW.user_id, 'cliente_reagendado', 'reagendamento', 'Agendamento alterado', 'Nova data: ' || t, NEW.id, k);
    PERFORM public.notify(bu, 'barbeiro_reagendado', 'reagendamento', 'Agendamento alterado', cn || ' · nova data: ' || t, NEW.id, k);
    PERFORM public.notify_admins('admin_alteracao', 'reagendamento', 'Agendamento alterado', cn || ' · nova data: ' || t, NEW.id, k);
  ELSIF NEW.service_ids IS DISTINCT FROM OLD.service_ids THEN
    k := 'alter:' || NEW.id || ':' || md5(NEW.service_ids::text);
    PERFORM public.notify(NEW.user_id, 'cliente_alteracao', 'alteracao', 'Agendamento alterado', t, NEW.id, k);
    PERFORM public.notify(bu, 'barbeiro_agenda', 'alteracao', 'Agendamento alterado', cn || ' · ' || t, NEW.id, k);
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.notify_appointment() FROM PUBLIC, anon, authenticated;

-- Live updates
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
