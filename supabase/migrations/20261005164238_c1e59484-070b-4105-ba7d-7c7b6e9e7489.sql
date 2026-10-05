CREATE OR REPLACE FUNCTION public.get_available_slots(_barber_id uuid, _day date, _duration int)
RETURNS TABLE(starts_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (SELECT * FROM public.operation_settings WHERE id = 1),
  cand AS (
    SELECT gs AS st
    FROM public.business_periods p, s,
       LATERAL generate_series((_day + p.opens_at) AT TIME ZONE 'America/Sao_Paulo',
                              ((_day + p.closes_at) AT TIME ZONE 'America/Sao_Paulo') - make_interval(mins => s.slot_step_minutes),
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
          AND NEW.starts_at < (d + p.closes_at) AT TIME ZONE 'America/Sao_Paulo')
     OR EXISTS (SELECT 1 FROM public.get_busy_slots(NEW.barber_id, d) b
          WHERE b.starts_at < NEW.ends_at AND b.ends_at > NEW.starts_at) THEN
    RAISE EXCEPTION 'Este horário acabou de ficar indisponível. Escolha outro horário.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END; $function$;