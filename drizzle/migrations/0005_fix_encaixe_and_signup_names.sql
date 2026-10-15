CREATE OR REPLACE FUNCTION public.staff_create_appointment(_client_id uuid, _barber_id uuid, _starts_at timestamp with time zone, _service_ids uuid[], _label text, _price_cents integer, _duration integer, _encaixe boolean)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE own uuid; nid uuid; day date; fn text; ln text; wa text; uid uuid; allowed uuid[];
BEGIN
  SELECT b.id INTO own FROM public.barbers b WHERE b.user_id = auth.uid() AND b.active AND b.approved_at IS NOT NULL;
  IF NOT public.has_role(auth.uid(),'admin') AND (own IS NULL OR own <> _barber_id) THEN
    RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
  IF NOT public.is_barber_bookable(_barber_id) THEN RAISE EXCEPTION 'Barbeiro indisponível.' USING ERRCODE='P0001'; END IF;
  SELECT coalesce(p.first_name,c.first_name), coalesce(p.last_name,c.last_name), coalesce(p.whatsapp,c.whatsapp,''), c.profile_id
    INTO fn, ln, wa, uid FROM public.clients c LEFT JOIN public.profiles p ON p.id = c.profile_id WHERE c.id = _client_id;
  IF fn IS NULL THEN RAISE EXCEPTION 'Cliente não encontrado.' USING ERRCODE='P0001'; END IF;
  IF _service_ids IS NULL OR array_length(_service_ids,1) IS NULL OR _duration IS NULL OR _duration <= 0 THEN
    RAISE EXCEPTION 'Escolha os serviços.' USING ERRCODE='P0001'; END IF;
  SELECT coalesce(service_ids, '{}') INTO allowed FROM public.barbers WHERE id=_barber_id;
  IF EXISTS (SELECT 1 FROM unnest(_service_ids) s WHERE NOT (s = ANY(allowed))) THEN
    RAISE EXCEPTION 'Este barbeiro não faz um dos serviços.' USING ERRCODE='P0001'; END IF;
  day := (_starts_at AT TIME ZONE 'America/Sao_Paulo')::date;
  IF NOT coalesce(_encaixe,true) AND NOT EXISTS (SELECT 1 FROM public.get_available_slots(_barber_id, day, _duration, _service_ids) s WHERE s.starts_at = _starts_at) THEN
    RAISE EXCEPTION 'Este horário acabou de ficar indisponível.' USING ERRCODE='P0001'; END IF;
  INSERT INTO public.appointments (user_id, service_id, barber_id, starts_at, ends_at, customer_first_name, customer_last_name,
     customer_whatsapp, service_ids, services_label, total_price_cents, total_duration_minutes, client_id, created_by, is_walkin)
  VALUES (uid, _service_ids[1], _barber_id, _starts_at, _starts_at + make_interval(mins => _duration), fn, ln,
     wa, _service_ids, _label, _price_cents, _duration, _client_id, auth.uid(), coalesce(_encaixe,true))
  RETURNING id INTO nid;
  RETURN nid;
END $function$;

CREATE OR REPLACE FUNCTION public.block_absent_booking()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE d date; s public.operation_settings%ROWTYPE; lim time; enc boolean;
BEGIN
  IF NEW.ends_at <= NEW.starts_at THEN RAISE EXCEPTION 'Horário inválido.' USING ERRCODE='P0001'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(NEW.barber_id::text));
  d := (NEW.starts_at AT TIME ZONE 'America/Sao_Paulo')::date;
  enc := NEW.is_walkin AND NEW.created_by IS NOT NULL AND public.is_staff_booker();
  IF enc THEN
    IF NOT public.is_barber_bookable(NEW.barber_id)
       OR COALESCE((SELECT closed FROM public.business_hours h WHERE h.weekday = extract(dow FROM d)), false)
       OR NOT EXISTS (SELECT 1 FROM public.business_periods p WHERE p.weekday = extract(dow FROM d)
            AND NEW.starts_at >= (d + p.opens_at) AT TIME ZONE 'America/Sao_Paulo'
            AND NEW.starts_at <= (d + p.closes_at) AT TIME ZONE 'America/Sao_Paulo') THEN
      RAISE EXCEPTION 'Encaixe só dentro do horário de funcionamento da barbearia.' USING ERRCODE = 'P0001';
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
END; $function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE m jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb); full_n text;
BEGIN
  full_n := coalesce(m->>'full_name', m->>'name', '');
  INSERT INTO public.profiles (id, first_name, last_name, whatsapp)
  VALUES (NEW.id,
    coalesce(nullif(m->>'first_name',''), nullif(m->>'given_name',''), split_part(full_n,' ',1), ''),
    coalesce(nullif(m->>'last_name',''), nullif(m->>'family_name',''), nullif(trim(substr(full_n, length(split_part(full_n,' ',1))+1)),''), ''),
    coalesce(m->>'whatsapp', ''))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END; $function$;