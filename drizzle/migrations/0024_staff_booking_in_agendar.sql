CREATE OR REPLACE FUNCTION public.staff_create_appointment(_client_id uuid, _barber_id uuid, _starts_at timestamp with time zone, _service_ids uuid[], _label text, _price_cents integer, _duration integer, _encaixe boolean)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE own uuid; nid uuid; day date; fn text; ln text; wa text; uid uuid; allowed uuid[];
BEGIN
  SELECT b.id INTO own FROM public.barbers b WHERE b.user_id = auth.uid() AND b.active AND b.approved_at IS NOT NULL;
  IF NOT public.is_admin_or_leader() AND (own IS NULL OR own <> _barber_id) THEN
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

CREATE OR REPLACE FUNCTION public.update_client_contact(_client_id uuid, _first text, _last text, _whatsapp text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE f text := trim(coalesce(_first,'')); l text := trim(coalesce(_last,'')); w text := nullif(trim(coalesce(_whatsapp,'')),''); pid uuid;
BEGIN
  IF NOT public.is_staff_booker() THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
  IF length(f) < 1 OR length(f) > 60 OR length(l) > 60 THEN RAISE EXCEPTION 'Informe o nome do cliente.' USING ERRCODE='P0001'; END IF;
  IF w IS NOT NULL AND NOT public.valid_br_whatsapp(w) THEN RAISE EXCEPTION 'WhatsApp inválido.' USING ERRCODE='P0001'; END IF;
  SELECT profile_id INTO pid FROM public.clients WHERE id = _client_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente não encontrado.' USING ERRCODE='P0001'; END IF;
  UPDATE public.clients SET first_name = f, last_name = l, whatsapp = coalesce(w, whatsapp) WHERE id = _client_id;
  IF pid IS NOT NULL THEN
    UPDATE public.profiles SET first_name = f, last_name = l, whatsapp = coalesce(w, whatsapp) WHERE id = pid;
  END IF;
END $function$;
REVOKE ALL ON FUNCTION public.update_client_contact(uuid,text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_client_contact(uuid,text,text,text) TO authenticated;