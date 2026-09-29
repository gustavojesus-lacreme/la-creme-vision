-- Configuração operacional (almoço padrão)
CREATE TABLE public.operation_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  lunch_start time,
  lunch_end time,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, UPDATE ON public.operation_settings TO authenticated;
GRANT ALL ON public.operation_settings TO service_role;
ALTER TABLE public.operation_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY os_read ON public.operation_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY os_admin_update ON public.operation_settings FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
INSERT INTO public.operation_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.validate_operation_settings()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (NEW.lunch_start IS NULL) <> (NEW.lunch_end IS NULL) THEN RAISE EXCEPTION 'Informe início e fim do almoço.' USING ERRCODE='P0001'; END IF;
  IF NEW.lunch_start IS NOT NULL AND NEW.lunch_end <= NEW.lunch_start THEN RAISE EXCEPTION 'O fim do almoço deve ser depois do início.' USING ERRCODE='P0001'; END IF;
  NEW.updated_at := now(); NEW.updated_by := auth.uid();
  RETURN NEW;
END; $$;
CREATE TRIGGER operation_settings_validate BEFORE UPDATE ON public.operation_settings
  FOR EACH ROW EXECUTE FUNCTION public.validate_operation_settings();

-- Auditoria nos bloqueios
ALTER TABLE public.barber_absences
  ADD COLUMN created_by uuid,
  ADD COLUMN updated_by uuid,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE POLICY barber_absences_self_update ON public.barber_absences FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM barbers b WHERE b.id = barber_absences.barber_id AND b.user_id = auth.uid() AND b.active AND b.approved_at IS NOT NULL))
  WITH CHECK (EXISTS (SELECT 1 FROM barbers b WHERE b.id = barber_absences.barber_id AND b.user_id = auth.uid() AND b.active AND b.approved_at IS NOT NULL));

CREATE OR REPLACE FUNCTION public.validate_absence()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE n int; lst text;
BEGIN
  IF NEW.kind NOT IN ('ferias','atestado','saude','emergencia','ausente','almoco','pausa','indisponivel') THEN
    RAISE EXCEPTION 'Tipo de bloqueio inválido.' USING ERRCODE='P0001'; END IF;
  IF NEW.ends_on < NEW.starts_on THEN RAISE EXCEPTION 'Data final anterior à inicial.' USING ERRCODE='P0001'; END IF;
  IF (NEW.starts_time IS NULL) <> (NEW.ends_time IS NULL) THEN RAISE EXCEPTION 'Informe horário inicial e final.' USING ERRCODE='P0001'; END IF;
  IF NEW.starts_time IS NOT NULL AND NEW.ends_time <= NEW.starts_time THEN RAISE EXCEPTION 'Horário final deve ser depois do inicial.' USING ERRCODE='P0001'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.barber_id::text));

  IF EXISTS (SELECT 1 FROM public.barber_absences x WHERE x.barber_id = NEW.barber_id AND x.id <> NEW.id
      AND x.starts_on <= NEW.ends_on AND x.ends_on >= NEW.starts_on
      AND (x.starts_time IS NULL OR NEW.starts_time IS NULL OR (x.starts_time < NEW.ends_time AND x.ends_time > NEW.starts_time))) THEN
    RAISE EXCEPTION 'Já existe um bloqueio que se sobrepõe a este período. Edite o bloqueio existente.' USING ERRCODE='P0001';
  END IF;

  SELECT count(*), string_agg(to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo','DD/MM HH24:MI') || '–' || to_char(a.ends_at AT TIME ZONE 'America/Sao_Paulo','HH24:MI'), ', ' ORDER BY a.starts_at)
    INTO n, lst
  FROM public.appointments a WHERE a.barber_id = NEW.barber_id AND a.status = 'agendado'
      AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN NEW.starts_on AND NEW.ends_on
      AND (NEW.starts_time IS NULL OR ((a.starts_at AT TIME ZONE 'America/Sao_Paulo')::time < NEW.ends_time
           AND (a.ends_at AT TIME ZONE 'America/Sao_Paulo')::time > NEW.starts_time));
  IF n > 0 THEN
    RAISE EXCEPTION 'Existem agendamentos neste período: % agendamento(s) (%). Resolva esses agendamentos antes de bloquear o período.', n, lst USING ERRCODE='P0001';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.updated_by := auth.uid();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS barber_absences_validate ON public.barber_absences;
CREATE TRIGGER barber_absences_validate BEFORE INSERT OR UPDATE ON public.barber_absences
  FOR EACH ROW EXECUTE FUNCTION public.validate_absence();

-- Disponibilidade: inclui almoço padrão (substituído pelo almoço próprio do barbeiro no dia)
CREATE OR REPLACE FUNCTION public.get_busy_slots(_barber_id uuid, _day date)
 RETURNS TABLE(starts_at timestamp with time zone, ends_at timestamp with time zone)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT a.starts_at, a.ends_at FROM public.appointments a
  WHERE a.barber_id = _barber_id AND a.status <> 'cancelado'
    AND a.starts_at >= (_day::timestamp AT TIME ZONE 'America/Sao_Paulo')
    AND a.starts_at < ((_day + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
  UNION ALL
  SELECT CASE WHEN x.starts_time IS NULL THEN (_day::timestamp AT TIME ZONE 'America/Sao_Paulo') ELSE ((_day + x.starts_time) AT TIME ZONE 'America/Sao_Paulo') END,
         CASE WHEN x.starts_time IS NULL THEN ((_day + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo') ELSE ((_day + x.ends_time) AT TIME ZONE 'America/Sao_Paulo') END
  FROM public.barber_absences x WHERE x.barber_id = _barber_id AND _day BETWEEN x.starts_on AND x.ends_on
  UNION ALL
  SELECT ((_day + s.lunch_start) AT TIME ZONE 'America/Sao_Paulo'), ((_day + s.lunch_end) AT TIME ZONE 'America/Sao_Paulo')
  FROM public.operation_settings s
  WHERE s.id = 1 AND s.lunch_start IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.barber_absences y WHERE y.barber_id = _barber_id AND y.kind = 'almoco' AND _day BETWEEN y.starts_on AND y.ends_on);
$function$;

-- Revalidação final do agendamento
CREATE OR REPLACE FUNCTION public.block_absent_booking()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.ends_at <= NEW.starts_at THEN RAISE EXCEPTION 'Horário inválido.' USING ERRCODE='P0001'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(NEW.barber_id::text));
  IF NOT public.is_barber_bookable(NEW.barber_id) OR EXISTS (
      SELECT 1 FROM public.get_busy_slots(NEW.barber_id, (NEW.starts_at AT TIME ZONE 'America/Sao_Paulo')::date) b
      WHERE b.starts_at < NEW.ends_at AND b.ends_at > NEW.starts_at) THEN
    RAISE EXCEPTION 'Este horário acabou de ficar indisponível. Escolha outro horário.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END; $function$;

-- Público: só datas e se é férias (sem motivo)
DROP FUNCTION IF EXISTS public.get_barber_absences_public();
CREATE FUNCTION public.get_barber_absences_public()
 RETURNS TABLE(barber_id uuid, starts_on date, ends_on date, is_vacation boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT a.barber_id, a.starts_on, a.ends_on, a.kind = 'ferias' FROM public.barber_absences a
  WHERE a.starts_time IS NULL AND a.ends_on >= (now() AT TIME ZONE 'America/Sao_Paulo')::date;
$function$;
GRANT EXECUTE ON FUNCTION public.get_barber_absences_public() TO anon, authenticated;