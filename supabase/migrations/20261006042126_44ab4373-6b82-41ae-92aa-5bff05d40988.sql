INSERT INTO public.notification_settings (key, audience, label, enabled, sort_order)
VALUES ('barbeiro_lembrete','barbeiro','Lembrete de atendimento', false, 99)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  dedupe_key text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, dedupe_key)
);
CREATE INDEX notifications_user_idx ON public.notifications (user_id, created_at DESC);
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notif_select_own ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY notif_update_own ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.notify(_user uuid, _setting text, _kind text, _title text, _body text, _appt uuid, _dedupe text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _user IS NULL THEN RETURN; END IF;
  IF NOT COALESCE((SELECT enabled FROM public.notification_settings WHERE key = _setting), false) THEN RETURN; END IF;
  INSERT INTO public.notifications (user_id, kind, title, body, appointment_id, dedupe_key)
  VALUES (_user, _kind, _title, _body, _appt, _dedupe) ON CONFLICT (user_id, dedupe_key) DO NOTHING;
END; $$;

CREATE OR REPLACE FUNCTION public.notify_admins(_setting text, _kind text, _title text, _body text, _appt uuid, _dedupe text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT user_id FROM public.user_roles WHERE role = 'admin' LOOP
    PERFORM public.notify(r.user_id, _setting, _kind, _title, _body, _appt, _dedupe);
  END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.appt_text(a public.appointments)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(NULLIF(a.services_label,''),'Atendimento') || ' com ' || COALESCE((SELECT name FROM public.barbers WHERE id = a.barber_id),'barbeiro')
    || ' em ' || to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI')
    || ' · Status: ' || CASE a.status WHEN 'agendado' THEN 'Agendado' WHEN 'cancelado' THEN 'Cancelado'
       WHEN 'finalizado' THEN 'Finalizado' WHEN 'nao_compareceu' THEN 'Não compareceu' ELSE a.status END;
$$;

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
    PERFORM public.notify(NEW.user_id, 'cliente_reagendado', 'reagendamento', 'Agendamento reagendado', t, NEW.id, k);
    PERFORM public.notify(bu, 'barbeiro_reagendado', 'reagendamento', 'Agendamento reagendado', cn || ' · ' || t, NEW.id, k);
    PERFORM public.notify_admins('admin_alteracao', 'reagendamento', 'Agendamento reagendado', cn || ' · ' || t, NEW.id, k);
  ELSIF NEW.service_ids IS DISTINCT FROM OLD.service_ids THEN
    k := 'alter:' || NEW.id || ':' || md5(NEW.service_ids::text);
    PERFORM public.notify(NEW.user_id, 'cliente_alteracao', 'alteracao', 'Agendamento alterado', t, NEW.id, k);
    PERFORM public.notify(bu, 'barbeiro_agenda', 'alteracao', 'Agendamento alterado', cn || ' · ' || t, NEW.id, k);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER appointments_notify AFTER INSERT OR UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.notify_appointment();

CREATE OR REPLACE FUNCTION public.notify_barber_pending()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NEW.approved_at IS NULL AND (TG_OP = 'INSERT' OR OLD.user_id IS NULL) THEN
    PERFORM public.notify_admins('admin_cadastro', 'cadastro', 'Barbeiro aguardando ativação',
      trim(NEW.name || ' ' || NEW.last_name) || ' concluiu o cadastro e aguarda ativação.', NULL, 'barber_pending:' || NEW.id || ':' || NEW.user_id);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER barbers_notify_pending AFTER INSERT OR UPDATE OF user_id ON public.barbers FOR EACH ROW EXECUTE FUNCTION public.notify_barber_pending();

CREATE OR REPLACE FUNCTION public.notify_new_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_admins('admin_cadastro', 'cadastro', 'Novo cadastro',
    COALESCE(NULLIF(trim(NEW.first_name || ' ' || NEW.last_name),''),'Novo usuário') || ' criou uma conta.', NULL, 'profile:' || NEW.id);
  RETURN NEW;
END; $$;
CREATE TRIGGER profiles_notify_new AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.notify_new_profile();

CREATE OR REPLACE FUNCTION public.notify_absence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE bu uuid; bn text; per text; n int;
BEGIN
  SELECT user_id, name INTO bu, bn FROM public.barbers WHERE id = NEW.barber_id;
  per := to_char(NEW.starts_on,'DD/MM') || CASE WHEN NEW.ends_on <> NEW.starts_on THEN ' a ' || to_char(NEW.ends_on,'DD/MM') ELSE '' END
      || CASE WHEN NEW.starts_time IS NOT NULL THEN ', ' || to_char(NEW.starts_time,'HH24:MI') || '–' || to_char(NEW.ends_time,'HH24:MI') ELSE ' (dia inteiro)' END;
  IF bu IS NOT NULL AND auth.uid() IS DISTINCT FROM bu THEN
    PERFORM public.notify(bu, 'barbeiro_bloqueio', 'bloqueio', 'Ausência/bloqueio na sua agenda', 'Período: ' || per, NULL,
      'abs:' || NEW.id || ':' || md5(per));
  END IF;
  SELECT count(*) INTO n FROM public.appointments a
   WHERE a.barber_id = NEW.barber_id AND a.status = 'agendado'
     AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN NEW.starts_on AND NEW.ends_on
     AND (NEW.starts_time IS NULL OR ((a.starts_at AT TIME ZONE 'America/Sao_Paulo')::time < NEW.ends_time
          AND (a.ends_at AT TIME ZONE 'America/Sao_Paulo')::time > NEW.starts_time));
  IF n > 0 THEN
    PERFORM public.notify_admins('admin_conflito', 'conflito', 'Conflito de agenda',
      bn || ': ausência em ' || per || ' tem ' || n || ' agendamento(s) marcado(s).', NULL, 'conf:' || NEW.id || ':' || md5(per));
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER absences_notify AFTER INSERT OR UPDATE ON public.barber_absences FOR EACH ROW EXECUTE FUNCTION public.notify_absence();

CREATE OR REPLACE FUNCTION public.notify_low_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.stock <= NEW.min_stock AND OLD.stock > OLD.min_stock THEN
    PERFORM public.notify_admins('admin_eventos', 'estoque', 'Estoque abaixo do mínimo',
      NEW.name || ': ' || NEW.stock || ' em estoque (mínimo ' || NEW.min_stock || ').', NULL, 'stock:' || NEW.id || ':' || extract(epoch FROM now())::bigint);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER products_notify_low AFTER UPDATE OF stock ON public.products FOR EACH ROW EXECUTE FUNCTION public.notify_low_stock();

CREATE OR REPLACE FUNCTION public.send_appointment_reminders()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.appointments%ROWTYPE; bu uuid; t text;
BEGIN
  FOR a IN SELECT * FROM public.appointments WHERE status = 'agendado' AND starts_at > now() AND starts_at <= now() + interval '2 hours' LOOP
    SELECT user_id INTO bu FROM public.barbers WHERE id = a.barber_id;
    t := public.appt_text(a);
    PERFORM public.notify(a.user_id, 'cliente_lembrete', 'lembrete', 'Lembrete: seu horário está chegando', t, a.id, 'lembrete:' || a.id || ':' || extract(epoch FROM a.starts_at)::bigint);
    PERFORM public.notify(bu, 'barbeiro_lembrete', 'lembrete', 'Lembrete de atendimento',
      trim(a.customer_first_name || ' ' || a.customer_last_name) || ' · ' || t, a.id, 'lembrete:' || a.id || ':' || extract(epoch FROM a.starts_at)::bigint);
  END LOOP;
END; $$;

REVOKE EXECUTE ON FUNCTION public.notify(uuid,text,text,text,text,uuid,text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_admins(text,text,text,text,uuid,text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.appt_text(public.appointments) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_appointment() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_barber_pending() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_new_profile() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_absence() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_low_stock() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.send_appointment_reminders() FROM public, anon, authenticated;