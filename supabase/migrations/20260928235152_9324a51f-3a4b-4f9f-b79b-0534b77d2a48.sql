CREATE TABLE public.barber_absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id uuid NOT NULL REFERENCES public.barbers(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('ferias','atestado','saude','emergencia','ausente')),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.barber_absences TO authenticated;
GRANT ALL ON public.barber_absences TO service_role;
ALTER TABLE public.barber_absences ENABLE ROW LEVEL SECURITY;
CREATE POLICY barber_absences_admin_all ON public.barber_absences FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX ON public.barber_absences (barber_id, starts_on, ends_on);

-- Public view of absences: only dates, never type or note
CREATE OR REPLACE FUNCTION public.get_barber_absences_public()
RETURNS TABLE (barber_id uuid, starts_on date, ends_on date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.barber_id, a.starts_on, a.ends_on FROM public.barber_absences a
  WHERE a.ends_on >= (now() AT TIME ZONE 'America/Sao_Paulo')::date;
$$;
GRANT EXECUTE ON FUNCTION public.get_barber_absences_public() TO anon, authenticated;

-- Absent days are fully busy
CREATE OR REPLACE FUNCTION public.get_busy_slots(_barber_id uuid, _day date)
RETURNS TABLE (starts_at timestamptz, ends_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.starts_at, a.ends_at FROM public.appointments a
  WHERE a.barber_id = _barber_id AND a.status <> 'cancelado'
    AND a.starts_at >= (_day::timestamp AT TIME ZONE 'America/Sao_Paulo')
    AND a.starts_at < ((_day + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
  UNION ALL
  SELECT (_day::timestamp AT TIME ZONE 'America/Sao_Paulo'), ((_day + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
  WHERE EXISTS (SELECT 1 FROM public.barber_absences x WHERE x.barber_id = _barber_id AND _day BETWEEN x.starts_on AND x.ends_on);
$$;

-- Block new bookings during absence
CREATE OR REPLACE FUNCTION public.block_absent_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.barber_absences x WHERE x.barber_id = NEW.barber_id
     AND (NEW.starts_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN x.starts_on AND x.ends_on) THEN
    RAISE EXCEPTION 'Barbeiro indisponível nesta data.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER appointments_block_absent BEFORE INSERT ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.block_absent_booking();