ALTER TABLE public.barbers ADD COLUMN IF NOT EXISTS photo_url text, ADD COLUMN IF NOT EXISTS lunch_start time;

-- Barbeiro pode atualizar o próprio cadastro (campos restritos por trigger)
CREATE POLICY barbers_self_update ON public.barbers FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_barber_self_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.operation_settings%ROWTYPE; dur interval;
BEGIN
  IF has_role(auth.uid(),'admin') OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.team_role IS DISTINCT FROM OLD.team_role
     OR NEW.active IS DISTINCT FROM OLD.active OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.archived_at IS DISTINCT FROM OLD.archived_at OR NEW.service_ids IS DISTINCT FROM OLD.service_ids
     OR NEW.commission_service_pct IS DISTINCT FROM OLD.commission_service_pct
     OR NEW.commission_plan_pct IS DISTINCT FROM OLD.commission_plan_pct
     OR NEW.specialty IS DISTINCT FROM OLD.specialty OR NEW.sort_order IS DISTINCT FROM OLD.sort_order
     OR NEW.color IS DISTINCT FROM OLD.color THEN
    RAISE EXCEPTION 'Sem permissão para alterar função, status ou permissões.' USING ERRCODE='42501';
  END IF;
  IF NEW.lunch_start IS NOT NULL AND NEW.lunch_start IS DISTINCT FROM OLD.lunch_start THEN
    SELECT * INTO s FROM public.operation_settings WHERE id = 1;
    IF s.lunch_start IS NULL OR s.lunch_end IS NULL THEN
      RAISE EXCEPTION 'A administração ainda não definiu o almoço.' USING ERRCODE='P0001'; END IF;
    dur := s.lunch_end - s.lunch_start;
    IF NOT EXISTS (SELECT 1 FROM public.business_periods p WHERE NEW.lunch_start >= p.opens_at AND NEW.lunch_start + dur <= p.closes_at) THEN
      RAISE EXCEPTION 'O almoço precisa ficar dentro do horário de funcionamento.' USING ERRCODE='P0001'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER barbers_guard_self BEFORE UPDATE ON public.barbers FOR EACH ROW EXECUTE FUNCTION public.guard_barber_self_update();

-- Almoço individual (mesma duração do geral)
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
  SELECT ((_day + COALESCE(b.lunch_start, s.lunch_start)) AT TIME ZONE 'America/Sao_Paulo'),
         ((_day + COALESCE(b.lunch_start, s.lunch_start) + (s.lunch_end - s.lunch_start)) AT TIME ZONE 'America/Sao_Paulo')
  FROM public.operation_settings s, public.barbers b
  WHERE s.id = 1 AND b.id = _barber_id AND s.lunch_start IS NOT NULL AND s.lunch_end IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.barber_absences y WHERE y.barber_id = _barber_id AND y.kind = 'almoco' AND _day BETWEEN y.starts_on AND y.ends_on);
$function$;

-- Barbeiro não cancela nem altera dados do agendamento; só finaliza/não compareceu
CREATE OR REPLACE FUNCTION public.guard_barber_appointment_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR has_role(auth.uid(),'admin') OR OLD.user_id = auth.uid() THEN RETURN NEW; END IF;
  IF NEW.status = 'cancelado' AND OLD.status <> 'cancelado' THEN
    RAISE EXCEPTION 'Somente a administração pode cancelar agendamentos.' USING ERRCODE='42501'; END IF;
  IF NEW.barber_id IS DISTINCT FROM OLD.barber_id OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
     OR NEW.ends_at IS DISTINCT FROM OLD.ends_at OR NEW.service_ids IS DISTINCT FROM OLD.service_ids
     OR NEW.total_price_cents IS DISTINCT FROM OLD.total_price_cents OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.customer_first_name IS DISTINCT FROM OLD.customer_first_name OR NEW.customer_last_name IS DISTINCT FROM OLD.customer_last_name
     OR NEW.customer_whatsapp IS DISTINCT FROM OLD.customer_whatsapp THEN
    RAISE EXCEPTION 'Sem permissão para alterar este agendamento.' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER appointments_guard_barber BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.guard_barber_appointment_update();

-- WhatsApp do cliente não é legível pelo app (nenhuma tela usa)
REVOKE SELECT ON public.appointments FROM authenticated, anon;
GRANT SELECT (id, user_id, service_id, barber_id, starts_at, ends_at, customer_first_name, customer_last_name, status, created_at, service_ids, services_label, total_price_cents, total_duration_minutes) ON public.appointments TO authenticated;

-- Encaixe / agendamento manual pelo barbeiro (somente na própria agenda)
CREATE OR REPLACE FUNCTION public.barber_create_appointment(_starts_at timestamptz, _service_ids uuid[], _first text, _last text, _whatsapp text, _label text, _price_cents int, _duration int)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE bid uuid; nid uuid; day date;
BEGIN
  SELECT id INTO bid FROM public.barbers WHERE user_id = auth.uid() AND active AND approved_at IS NOT NULL;
  IF bid IS NULL THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
  IF length(trim(coalesce(_first,''))) = 0 OR length(trim(coalesce(_whatsapp,''))) = 0 THEN
    RAISE EXCEPTION 'Informe nome e WhatsApp do cliente.' USING ERRCODE='P0001'; END IF;
  IF _service_ids IS NULL OR array_length(_service_ids,1) IS NULL OR _duration IS NULL OR _duration <= 0 THEN
    RAISE EXCEPTION 'Escolha os serviços.' USING ERRCODE='P0001'; END IF;
  day := (_starts_at AT TIME ZONE 'America/Sao_Paulo')::date;
  IF NOT EXISTS (SELECT 1 FROM public.get_available_slots(bid, day, _duration, _service_ids) s WHERE s.starts_at = _starts_at) THEN
    RAISE EXCEPTION 'Este horário acabou de ficar indisponível.' USING ERRCODE='P0001'; END IF;
  INSERT INTO public.appointments (user_id, service_id, barber_id, starts_at, ends_at, customer_first_name, customer_last_name,
     customer_whatsapp, service_ids, services_label, total_price_cents, total_duration_minutes)
  VALUES (NULL, _service_ids[1], bid, _starts_at, _starts_at + make_interval(mins => _duration), trim(_first), trim(coalesce(_last,'')),
     trim(_whatsapp), _service_ids, _label, _price_cents, _duration)
  RETURNING id INTO nid;
  RETURN nid;
END; $$;
REVOKE EXECUTE ON FUNCTION public.barber_create_appointment(timestamptz, uuid[], text, text, text, text, int, int) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.barber_create_appointment(timestamptz, uuid[], text, text, text, text, int, int) TO authenticated;

-- Clientes atendidos pelo barbeiro (sem WhatsApp)
CREATE OR REPLACE FUNCTION public.get_my_clients()
RETURNS TABLE(client_name text, visits int, last_visit timestamptz, history jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH b AS (SELECT id FROM public.barbers WHERE user_id = auth.uid() AND active AND approved_at IS NOT NULL),
  ap AS (
    SELECT a.*, trim(a.customer_first_name || ' ' || a.customer_last_name) AS nm,
      COALESCE(a.user_id::text, lower(trim(a.customer_first_name || ' ' || a.customer_last_name)) || '|' || regexp_replace(a.customer_whatsapp,'\D','','g')) AS ck
    FROM public.appointments a, b WHERE a.barber_id = b.id AND a.status IN ('finalizado','agendado','nao_compareceu')
  )
  SELECT max(ap.nm), count(*)::int, max(ap.starts_at),
    jsonb_agg(jsonb_build_object('starts_at', ap.starts_at, 'status', ap.status, 'services', ap.services_label,
      'products', (SELECT COALESCE(jsonb_agg(f.description), '[]'::jsonb) FROM public.financial_entries f
                   WHERE f.appointment_id = ap.id AND f.product_id IS NOT NULL AND f.refunded_at IS NULL))
      ORDER BY ap.starts_at DESC)
  FROM ap GROUP BY ap.ck ORDER BY max(ap.starts_at) DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_clients() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_my_clients() TO authenticated;

-- Barbeiro vê (sem alterar) as notificações
CREATE POLICY ns_barber_read ON public.notification_settings FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'barbeiro'));

-- Fotos dos barbeiros
CREATE POLICY barber_photos_read ON storage.objects FOR SELECT USING (bucket_id = 'barber-photos');
CREATE POLICY barber_photos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'barber-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY barber_photos_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'barber-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY barber_photos_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'barber-photos' AND (storage.foldername(name))[1] = auth.uid()::text);