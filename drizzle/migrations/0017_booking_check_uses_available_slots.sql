CREATE OR REPLACE FUNCTION public.block_absent_booking() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d date; enc boolean; dur integer;
BEGIN
  IF NEW.ends_at <= NEW.starts_at THEN RAISE EXCEPTION 'Horário inválido.' USING ERRCODE='P0001'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(NEW.barber_id::text));
  d := (NEW.starts_at AT TIME ZONE 'America/Sao_Paulo')::date;
  enc := NEW.is_walkin AND NEW.created_by IS NOT NULL AND public.is_staff_booker();
  IF enc THEN
    IF NOT public.is_barber_bookable(NEW.barber_id) THEN
      RAISE EXCEPTION 'Barbeiro indisponível.' USING ERRCODE='P0001';
    END IF;
    RETURN NEW;
  END IF;
  dur := GREATEST(1, ceil(extract(epoch FROM (NEW.ends_at - NEW.starts_at)) / 60)::int);
  -- Mesma fonte de disponibilidade mostrada na tela (almoço bloqueia só o início).
  IF NOT EXISTS (SELECT 1 FROM public.get_available_slots(NEW.barber_id, d, dur, COALESCE(NEW.service_ids, ARRAY[NEW.service_id])) a
                 WHERE a.starts_at = NEW.starts_at) THEN
    RAISE EXCEPTION 'Este horário acabou de ficar indisponível. Escolha outro horário.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;