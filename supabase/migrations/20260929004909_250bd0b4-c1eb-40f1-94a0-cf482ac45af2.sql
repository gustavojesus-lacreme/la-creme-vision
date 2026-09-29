-- 1. Múltiplos períodos por dia
CREATE TABLE public.business_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  opens_at time NOT NULL,
  closes_at time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (closes_at > opens_at)
);
GRANT SELECT ON public.business_periods TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.business_periods TO authenticated;
GRANT ALL ON public.business_periods TO service_role;
ALTER TABLE public.business_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY bp_read ON public.business_periods FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY bp_admin ON public.business_periods FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
INSERT INTO public.business_periods (weekday, opens_at, closes_at)
  SELECT weekday, opens_at, closes_at FROM public.business_hours WHERE NOT closed AND opens_at IS NOT NULL AND closes_at IS NOT NULL;

GRANT UPDATE ON public.business_hours TO authenticated;
CREATE POLICY business_hours_admin_update ON public.business_hours FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.validate_business_period()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.business_periods p WHERE p.weekday = NEW.weekday AND p.id <> NEW.id
     AND p.opens_at < NEW.closes_at AND p.closes_at > NEW.opens_at) THEN
    RAISE EXCEPTION 'Este período se sobrepõe a outro do mesmo dia.' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER business_periods_validate BEFORE INSERT OR UPDATE ON public.business_periods
  FOR EACH ROW EXECUTE FUNCTION public.validate_business_period();

-- 2. Regras de agendamento e dados gerais (linha única existente)
ALTER TABLE public.operation_settings
  ADD COLUMN slot_step_minutes int NOT NULL DEFAULT 30 CHECK (slot_step_minutes IN (10,15,20,30,45,60)),
  ADD COLUMN min_advance_minutes int NOT NULL DEFAULT 0 CHECK (min_advance_minutes >= 0),
  ADD COLUMN max_advance_days int CHECK (max_advance_days IS NULL OR max_advance_days > 0),
  ADD COLUMN tolerance_minutes int NOT NULL DEFAULT 5 CHECK (tolerance_minutes >= 0),
  ADD COLUMN cancel_min_hours int CHECK (cancel_min_hours IS NULL OR cancel_min_hours >= 0),
  ADD COLUMN reschedule_per_week int NOT NULL DEFAULT 1 CHECK (reschedule_per_week >= 0),
  ADD COLUMN reschedule_extra_fee_cents int NOT NULL DEFAULT 500 CHECK (reschedule_extra_fee_cents >= 0),
  ADD COLUMN reschedule_block_saturday boolean NOT NULL DEFAULT true,
  ADD COLUMN reschedule_cutoff_weekday smallint DEFAULT 5 CHECK (reschedule_cutoff_weekday IS NULL OR reschedule_cutoff_weekday BETWEEN 0 AND 6),
  ADD COLUMN reschedule_cutoff_time time DEFAULT '17:00',
  ADD COLUMN shop_name text NOT NULL DEFAULT 'LA CREME BARBER',
  ADD COLUMN shop_whatsapp text NOT NULL DEFAULT '',
  ADD COLUMN shop_email text NOT NULL DEFAULT '',
  ADD COLUMN shop_address text NOT NULL DEFAULT '',
  ADD COLUMN shop_public_info text NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION public.get_public_settings()
RETURNS TABLE(shop_name text, shop_whatsapp text, shop_email text, shop_address text, shop_public_info text,
  slot_step_minutes int, min_advance_minutes int, max_advance_days int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT shop_name, shop_whatsapp, shop_email, shop_address, shop_public_info, slot_step_minutes, min_advance_minutes, max_advance_days
  FROM public.operation_settings WHERE id = 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_settings() TO anon, authenticated;

-- 3. Fonte única de horários disponíveis
CREATE OR REPLACE FUNCTION public.get_available_slots(_barber_id uuid, _day date, _duration int)
RETURNS TABLE(starts_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (SELECT * FROM public.operation_settings WHERE id = 1),
  cand AS (
    SELECT gs AS st
    FROM public.business_periods p, s,
      LATERAL generate_series((_day + p.opens_at) AT TIME ZONE 'America/Sao_Paulo',
                              ((_day + p.closes_at) AT TIME ZONE 'America/Sao_Paulo') - make_interval(mins => _duration),
                              make_interval(mins => s.slot_step_minutes)) gs
    WHERE p.weekday = extract(dow FROM _day)
      AND NOT COALESCE((SELECT closed FROM public.business_hours h WHERE h.weekday = p.weekday), false)
      AND public.is_barber_bookable(_barber_id)
      AND _duration > 0
      AND (s.max_advance_days IS NULL OR _day <= (now() AT TIME ZONE 'America/Sao_Paulo')::date + s.max_advance_days)
  )
  SELECT c.st FROM cand c, s
  WHERE c.st >= now() + make_interval(mins => s.min_advance_minutes) AND c.st > now()
    AND NOT EXISTS (SELECT 1 FROM public.get_busy_slots(_barber_id, _day) b
                    WHERE b.starts_at < c.st + make_interval(mins => _duration) AND b.ends_at > c.st)
  ORDER BY c.st;
$$;
GRANT EXECUTE ON FUNCTION public.get_available_slots(uuid, date, int) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.block_absent_booking()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE d date; s public.operation_settings%ROWTYPE;
BEGIN
  IF NEW.ends_at <= NEW.starts_at THEN RAISE EXCEPTION 'Horário inválido.' USING ERRCODE='P0001'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(NEW.barber_id::text));
  d := (NEW.starts_at AT TIME ZONE 'America/Sao_Paulo')::date;
  SELECT * INTO s FROM public.operation_settings WHERE id = 1;
  IF NOT public.is_barber_bookable(NEW.barber_id)
     OR NEW.starts_at < now() + make_interval(mins => COALESCE(s.min_advance_minutes,0))
     OR (s.max_advance_days IS NOT NULL AND d > (now() AT TIME ZONE 'America/Sao_Paulo')::date + s.max_advance_days)
     OR COALESCE((SELECT closed FROM public.business_hours h WHERE h.weekday = extract(dow FROM d)), false)
     OR NOT EXISTS (SELECT 1 FROM public.business_periods p WHERE p.weekday = extract(dow FROM d)
          AND NEW.starts_at >= (d + p.opens_at) AT TIME ZONE 'America/Sao_Paulo'
          AND NEW.ends_at <= (d + p.closes_at) AT TIME ZONE 'America/Sao_Paulo')
     OR EXISTS (SELECT 1 FROM public.get_busy_slots(NEW.barber_id, d) b
          WHERE b.starts_at < NEW.ends_at AND b.ends_at > NEW.starts_at) THEN
    RAISE EXCEPTION 'Este horário acabou de ficar indisponível. Escolha outro horário.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END; $function$;

-- Prazo de cancelamento pelo cliente
CREATE OR REPLACE FUNCTION public.enforce_cancel_deadline()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h int;
BEGIN
  IF NEW.status = 'cancelado' AND OLD.status = 'agendado' AND OLD.user_id = auth.uid()
     AND NOT has_role(auth.uid(),'admin')
     AND NOT EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = OLD.barber_id AND b.user_id = auth.uid()) THEN
    SELECT cancel_min_hours INTO h FROM public.operation_settings WHERE id = 1;
    IF h IS NOT NULL AND OLD.starts_at < now() + make_interval(hours => h) THEN
      RAISE EXCEPTION 'Cancelamento permitido somente com % hora(s) de antecedência. Fale com a barbearia.', h USING ERRCODE='P0001';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER appointments_cancel_deadline BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_cancel_deadline();

-- 4. Planos
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_cents int NOT NULL CHECK (price_cents >= 0),
  validity_days int NOT NULL CHECK (validity_days > 0),
  max_uses_per_week int CHECK (max_uses_per_week IS NULL OR max_uses_per_week > 0),
  compensation_weeks int NOT NULL DEFAULT 0 CHECK (compensation_weeks >= 0),
  auto_renew boolean NOT NULL DEFAULT false,
  usage_rules text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO authenticated;
GRANT INSERT, UPDATE ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY plans_read ON public.plans FOR SELECT TO authenticated USING (active OR has_role(auth.uid(),'admin'));
CREATE POLICY plans_admin_insert ON public.plans FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY plans_admin_update ON public.plans FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE TRIGGER plans_updated_at BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id),
  quantity int NOT NULL CHECK (quantity > 0),
  UNIQUE (plan_id, service_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_items TO authenticated;
GRANT ALL ON public.plan_items TO service_role;
ALTER TABLE public.plan_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY plan_items_read ON public.plan_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.plans p WHERE p.id = plan_id AND (p.active OR has_role(auth.uid(),'admin'))));
CREATE POLICY plan_items_admin ON public.plan_items FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- 5. Notificações (somente configuração; nenhum envio)
CREATE TABLE public.notification_settings (
  key text PRIMARY KEY,
  audience text NOT NULL CHECK (audience IN ('cliente','barbeiro','admin')),
  label text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.notification_settings TO authenticated;
GRANT ALL ON public.notification_settings TO service_role;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY ns_admin_read ON public.notification_settings FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY ns_admin_update ON public.notification_settings FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE TRIGGER ns_updated_at BEFORE UPDATE ON public.notification_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.notification_settings (key, audience, label, sort_order) VALUES
 ('cliente_criado','cliente','Agendamento criado',1),
 ('cliente_confirmado','cliente','Agendamento confirmado',2),
 ('cliente_cancelado','cliente','Agendamento cancelado',3),
 ('cliente_reagendado','cliente','Reagendamento',4),
 ('cliente_lembrete','cliente','Lembrete',5),
 ('cliente_alteracao','cliente','Alteração de horário',6),
 ('barbeiro_novo','barbeiro','Novo agendamento',1),
 ('barbeiro_cancelado','barbeiro','Cancelamento',2),
 ('barbeiro_reagendado','barbeiro','Reagendamento',3),
 ('barbeiro_agenda','barbeiro','Alteração de agenda',4),
 ('barbeiro_bloqueio','barbeiro','Ausência/bloqueio relevante',5),
 ('admin_cadastro','admin','Novos cadastros',1),
 ('admin_conflito','admin','Conflitos',2),
 ('admin_alteracao','admin','Alterações importantes',3),
 ('admin_eventos','admin','Eventos administrativos',4);