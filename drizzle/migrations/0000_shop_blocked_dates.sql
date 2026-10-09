CREATE TABLE public.shop_blocked_dates (
  day date PRIMARY KEY,
  reason text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shop_blocked_dates TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.shop_blocked_dates TO authenticated;
GRANT ALL ON public.shop_blocked_dates TO service_role;
ALTER TABLE public.shop_blocked_dates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads blocked dates" ON public.shop_blocked_dates FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage blocked dates" ON public.shop_blocked_dates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.get_available_slots(_barber_id uuid, _day date, _duration integer, _service_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(starts_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH s AS (SELECT * FROM public.operation_settings WHERE id = 1),
  lim AS (SELECT min(latest_start_time) AS t FROM public.services WHERE _service_ids IS NOT NULL AND id = ANY(_service_ids)),
  cand AS (
    SELECT DISTINCT gs AS st
    FROM public.business_periods p, s,
       LATERAL generate_series((_day + p.opens_at) AT TIME ZONE 'America/Sao_Paulo',
                              (_day + p.closes_at) AT TIME ZONE 'America/Sao_Paulo',
                              make_interval(mins => s.slot_step_minutes)) gs
    WHERE p.weekday = extract(dow FROM _day)
      AND NOT COALESCE((SELECT closed FROM public.business_hours h WHERE h.weekday = p.weekday), false)
      AND NOT EXISTS (SELECT 1 FROM public.shop_blocked_dates bd WHERE bd.day = _day)
      AND public.is_barber_bookable(_barber_id)
      AND _duration > 0
      AND (s.max_advance_days IS NULL OR _day <= (now() AT TIME ZONE 'America/Sao_Paulo')::date + s.max_advance_days)
  )
  SELECT c.st FROM cand c, s, lim
   WHERE c.st >= now() + make_interval(mins => s.min_advance_minutes) AND c.st > now()
    AND (lim.t IS NULL OR c.st <= (_day + lim.t) AT TIME ZONE 'America/Sao_Paulo')
    AND NOT EXISTS (SELECT 1 FROM public.get_busy_slots(_barber_id, _day) b
                    WHERE b.starts_at < c.st + make_interval(mins => _duration) AND b.ends_at > c.st)
  ORDER BY c.st;
$function$;

CREATE OR REPLACE FUNCTION public.block_shop_closed_date()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status <> 'cancelled' AND EXISTS (SELECT 1 FROM public.shop_blocked_dates
     WHERE day = (NEW.starts_at AT TIME ZONE 'America/Sao_Paulo')::date) THEN
    RAISE EXCEPTION 'Barbearia fechada nesta data';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_block_shop_closed_date BEFORE INSERT ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.block_shop_closed_date();