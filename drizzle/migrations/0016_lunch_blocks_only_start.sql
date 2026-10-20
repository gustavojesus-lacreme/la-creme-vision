CREATE OR REPLACE FUNCTION public.get_available_slots(_barber_id uuid, _day date, _duration integer, _service_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(starts_at timestamp with time zone)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH s AS (SELECT * FROM public.operation_settings WHERE id = 1),
  lim AS (SELECT min(latest_start_time) AS t FROM public.services WHERE _service_ids IS NOT NULL AND id = ANY(_service_ids)),
  lunch AS (
    SELECT ((_day + COALESCE(b.lunch_start, s.lunch_start)) AT TIME ZONE 'America/Sao_Paulo') AS ls,
           ((_day + COALESCE(b.lunch_start, s.lunch_start) + (s.lunch_end - s.lunch_start)) AT TIME ZONE 'America/Sao_Paulo') AS le
    FROM s, public.barbers b
    WHERE b.id = _barber_id AND s.lunch_start IS NOT NULL AND s.lunch_end IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.barber_absences y WHERE y.barber_id = _barber_id AND y.kind = 'almoco' AND _day BETWEEN y.starts_on AND y.ends_on)
  ),
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
    -- Lunch blocks only start times inside it; a service started before lunch may run into it.
    AND NOT EXISTS (SELECT 1 FROM lunch l WHERE c.st >= l.ls AND c.st < l.le)
    AND NOT EXISTS (SELECT 1 FROM public.get_busy_slots(_barber_id, _day) b
                    WHERE b.starts_at < c.st + make_interval(mins => _duration) AND b.ends_at > c.st
                      AND NOT EXISTS (SELECT 1 FROM lunch l WHERE l.ls = b.starts_at AND l.le = b.ends_at))
  ORDER BY c.st;
$function$;