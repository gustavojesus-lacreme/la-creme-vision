CREATE OR REPLACE FUNCTION public.block_absent_booking() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE d date; s public.operation_settings%ROWTYPE; lim time; enc boolean;
BEGIN
  IF NEW.ends_at <= NEW.starts_at THEN RAISE EXCEPTION 'Horário inválido.' USING ERRCODE='P0001'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(NEW.barber_id::text));
  d := (NEW.starts_at AT TIME ZONE 'America/Sao_Paulo')::date;
  enc := NEW.is_walkin AND NEW.created_by IS NOT NULL AND public.is_staff_booker();
  IF enc THEN
    -- Encaixe/avulso pode ser criado em qualquer horário; só exige barbeiro ativo.
    IF NOT public.is_barber_bookable(NEW.barber_id) THEN
      RAISE EXCEPTION 'Barbeiro indisponível.' USING ERRCODE='P0001';
    END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO s FROM public.operation_settings WHERE id = 1;
  SELECT min(latest_start_time) INTO lim FROM public.services WHERE id = ANY(COALESCE(NEW.service_ids, ARRAY[NEW.service_id]));
  IF NOT public.is_barber_bookable(NEW.barber_id)
     OR NEW.starts_at < now() + make_interval(mins => COALESCE(s.min_advance_minutes,0))
     OR (s.max_advance_days IS NOT NULL AND d > (now() AT TIME ZONE 'America/Sao_Paulo')::date + s.max_advance_days)
     OR (lim IS NOT NULL AND NEW.starts_at > (d + lim) AT TIME ZONE 'America/Sao_Paulo')
     OR COALESCE((SELECT closed FROM public.business_hours h WHERE h.weekday = extract(dow FROM d)), false)
     OR NOT EXISTS (SELECT 1 FROM public.business_periods p WHERE p.weekday = extract(dow FROM d)
          AND NEW.starts_at >= (d + p.opens_at) AT TIME ZONE 'America/Sao_Paulo'
          AND NEW.starts_at <= (d + p.closes_at) AT TIME ZONE 'America/Sao_Paulo')
     OR EXISTS (SELECT 1 FROM public.get_busy_slots(NEW.barber_id, d) b
          WHERE b.starts_at < NEW.ends_at AND b.ends_at > NEW.starts_at) THEN
    RAISE EXCEPTION 'Este horário acabou de ficar indisponível. Escolha outro horário.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$fn$;