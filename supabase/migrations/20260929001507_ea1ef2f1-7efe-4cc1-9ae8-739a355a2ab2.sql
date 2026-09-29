ALTER TABLE public.barber_absences ADD COLUMN starts_time time, ADD COLUMN ends_time time;
GRANT SELECT, INSERT, DELETE ON public.barber_absences TO authenticated;

CREATE POLICY barber_absences_self_select ON public.barber_absences FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = barber_id AND b.user_id = auth.uid()));
CREATE POLICY barber_absences_self_insert ON public.barber_absences FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = barber_id AND b.user_id = auth.uid() AND b.active AND b.approved_at IS NOT NULL));
CREATE POLICY barber_absences_self_delete ON public.barber_absences FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = barber_id AND b.user_id = auth.uid() AND b.active AND b.approved_at IS NOT NULL));

CREATE OR REPLACE FUNCTION public.validate_absence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.ends_on < NEW.starts_on THEN RAISE EXCEPTION 'Data final anterior à inicial.' USING ERRCODE='P0001'; END IF;
  IF (NEW.starts_time IS NULL) <> (NEW.ends_time IS NULL) THEN RAISE EXCEPTION 'Informe horário inicial e final.' USING ERRCODE='P0001'; END IF;
  IF NEW.starts_time IS NOT NULL AND NEW.ends_time <= NEW.starts_time THEN RAISE EXCEPTION 'Horário final deve ser depois do inicial.' USING ERRCODE='P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.appointments a WHERE a.barber_id = NEW.barber_id AND a.status = 'agendado'
      AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN NEW.starts_on AND NEW.ends_on
      AND (NEW.starts_time IS NULL OR ((a.starts_at AT TIME ZONE 'America/Sao_Paulo')::time < NEW.ends_time
           AND (a.ends_at AT TIME ZONE 'America/Sao_Paulo')::time > NEW.starts_time))) THEN
    RAISE EXCEPTION 'Existem agendamentos neste período. Resolva os agendamentos antes de bloquear este horário.' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER barber_absences_validate BEFORE INSERT ON public.barber_absences FOR EACH ROW EXECUTE FUNCTION public.validate_absence();

CREATE OR REPLACE FUNCTION public.block_absent_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.barber_absences x WHERE x.barber_id = NEW.barber_id
     AND (NEW.starts_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN x.starts_on AND x.ends_on
     AND (x.starts_time IS NULL OR ((NEW.starts_at AT TIME ZONE 'America/Sao_Paulo')::time < x.ends_time
          AND (NEW.ends_at AT TIME ZONE 'America/Sao_Paulo')::time > x.starts_time))) THEN
    RAISE EXCEPTION 'Barbeiro indisponível neste horário.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.get_busy_slots(_barber_id uuid, _day date)
RETURNS TABLE(starts_at timestamptz, ends_at timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT a.starts_at, a.ends_at FROM public.appointments a
  WHERE a.barber_id = _barber_id AND a.status <> 'cancelado'
    AND a.starts_at >= (_day::timestamp AT TIME ZONE 'America/Sao_Paulo')
    AND a.starts_at < ((_day + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
  UNION ALL
  SELECT CASE WHEN x.starts_time IS NULL THEN (_day::timestamp AT TIME ZONE 'America/Sao_Paulo') ELSE ((_day + x.starts_time) AT TIME ZONE 'America/Sao_Paulo') END,
         CASE WHEN x.starts_time IS NULL THEN ((_day + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo') ELSE ((_day + x.ends_time) AT TIME ZONE 'America/Sao_Paulo') END
  FROM public.barber_absences x WHERE x.barber_id = _barber_id AND _day BETWEEN x.starts_on AND x.ends_on;
$$;

CREATE OR REPLACE FUNCTION public.get_barber_absences_public()
RETURNS TABLE(barber_id uuid, starts_on date, ends_on date) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT a.barber_id, a.starts_on, a.ends_on FROM public.barber_absences a
  WHERE a.starts_time IS NULL AND a.ends_on >= (now() AT TIME ZONE 'America/Sao_Paulo')::date;
$$;