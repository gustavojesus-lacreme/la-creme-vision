CREATE SEQUENCE IF NOT EXISTS public.client_code_seq MINVALUE 1 MAXVALUE 99999 NO CYCLE;

CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code integer NOT NULL UNIQUE DEFAULT nextval('public.client_code_seq'),
  profile_id uuid UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  whatsapp text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER SEQUENCE public.client_code_seq OWNED BY public.clients.code;
GRANT SELECT ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view clients" ON public.clients FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Clients view own code" ON public.clients FOR SELECT TO authenticated USING (profile_id = auth.uid());

-- código nunca editável
CREATE OR REPLACE FUNCTION public.guard_client_code() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.code <> OLD.code THEN RAISE EXCEPTION 'O código do cliente não pode ser alterado.'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER clients_guard_code BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.guard_client_code();

-- backfill: clientes já cadastrados (sem função de equipe), por ordem de cadastro
INSERT INTO public.clients (profile_id)
SELECT p.id FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role <> 'user')
ORDER BY p.created_at, p.id;

-- novos cadastros públicos recebem código
CREATE OR REPLACE FUNCTION public.assign_client_code() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.clients (profile_id) VALUES (NEW.id) ON CONFLICT (profile_id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_assign_client_code AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.assign_client_code();

ALTER TABLE public.appointments
  ADD COLUMN client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN created_by uuid,
  ADD COLUMN is_walkin boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_staff_booker() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.barbers WHERE user_id = auth.uid() AND active AND approved_at IS NOT NULL)
$$;

CREATE OR REPLACE FUNCTION public.search_clients(_q text)
RETURNS TABLE(id uuid, code integer, first_name text, last_name text, whatsapp text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE q text := trim(coalesce(_q,'')); digits text; adm boolean := public.has_role(auth.uid(),'admin');
BEGIN
  IF NOT public.is_staff_booker() THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
  IF length(q) < 2 THEN RETURN; END IF;
  digits := regexp_replace(q,'\D','','g');
  RETURN QUERY
  WITH c AS (
    SELECT c.id, c.code,
      coalesce(p.first_name, c.first_name) fn, coalesce(p.last_name, c.last_name) ln,
      nullif(coalesce(p.whatsapp, c.whatsapp, ''),'') wa
    FROM public.clients c LEFT JOIN public.profiles p ON p.id = c.profile_id
    WHERE c.profile_id IS NULL OR p.archived_at IS NULL
  )
  SELECT c.id, c.code, c.fn, c.ln,
    CASE WHEN c.wa IS NULL THEN NULL WHEN adm THEN c.wa ELSE '•••• ' || right(regexp_replace(c.wa,'\D','','g'),4) END
  FROM c
  WHERE (q ~ '^#?\d{1,5}$' AND c.code = digits::int)
     OR (length(digits) >= 8 AND regexp_replace(coalesce(c.wa,''),'\D','','g') LIKE '%' || digits || '%')
     OR (lower(trim(c.fn || ' ' || c.ln)) LIKE '%' || lower(q) || '%')
  ORDER BY c.code LIMIT 20;
END $$;

CREATE OR REPLACE FUNCTION public.create_walkin_client(_first text, _last text, _whatsapp text)
RETURNS TABLE(id uuid, code integer, existed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f text := trim(coalesce(_first,'')); l text := trim(coalesce(_last,'')); w text := nullif(trim(coalesce(_whatsapp,'')),''); d text; hit record;
BEGIN
  IF NOT public.is_staff_booker() THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
  IF length(f) = 0 OR length(f) > 60 OR length(l) > 60 OR length(coalesce(w,'')) > 30 THEN
    RAISE EXCEPTION 'Informe o nome do cliente.' USING ERRCODE='P0001'; END IF;
  d := regexp_replace(coalesce(w,''),'\D','','g');
  IF length(d) > 0 AND length(d) < 8 THEN RAISE EXCEPTION 'WhatsApp inválido.' USING ERRCODE='P0001'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('create_walkin_client'));
  SELECT c.id, c.code INTO hit FROM public.clients c LEFT JOIN public.profiles p ON p.id = c.profile_id
  WHERE (length(d) >= 8 AND regexp_replace(coalesce(p.whatsapp, c.whatsapp, ''),'\D','','g') = d)
     OR (lower(coalesce(p.first_name,c.first_name)) = lower(f) AND lower(coalesce(p.last_name,c.last_name)) = lower(l)
         AND (length(d) = 0 OR nullif(regexp_replace(coalesce(p.whatsapp, c.whatsapp, ''),'\D','','g'),'') IS NULL))
  ORDER BY c.code LIMIT 1;
  IF hit.id IS NOT NULL THEN RETURN QUERY SELECT hit.id, hit.code, true; RETURN; END IF;
  RETURN QUERY INSERT INTO public.clients (first_name, last_name, whatsapp, created_by)
    VALUES (f, l, w, auth.uid()) RETURNING clients.id, clients.code, false;
END $$;

CREATE OR REPLACE FUNCTION public.staff_create_appointment(_client_id uuid, _barber_id uuid, _starts_at timestamptz, _service_ids uuid[], _label text, _price_cents integer, _duration integer, _encaixe boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE own uuid; nid uuid; day date; fn text; ln text; wa text; uid uuid;
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
  IF EXISTS (SELECT 1 FROM unnest(_service_ids) s WHERE NOT s = ANY((SELECT service_ids FROM public.barbers WHERE id=_barber_id))) THEN
    RAISE EXCEPTION 'Este barbeiro não faz um dos serviços.' USING ERRCODE='P0001'; END IF;
  day := (_starts_at AT TIME ZONE 'America/Sao_Paulo')::date;
  IF NOT EXISTS (SELECT 1 FROM public.get_available_slots(_barber_id, day, _duration, _service_ids) s WHERE s.starts_at = _starts_at) THEN
    RAISE EXCEPTION 'Este horário acabou de ficar indisponível.' USING ERRCODE='P0001'; END IF;
  INSERT INTO public.appointments (user_id, service_id, barber_id, starts_at, ends_at, customer_first_name, customer_last_name,
     customer_whatsapp, service_ids, services_label, total_price_cents, total_duration_minutes, client_id, created_by, is_walkin)
  VALUES (uid, _service_ids[1], _barber_id, _starts_at, _starts_at + make_interval(mins => _duration), fn, ln,
     wa, _service_ids, _label, _price_cents, _duration, _client_id, auth.uid(), coalesce(_encaixe,true))
  RETURNING id INTO nid;
  RETURN nid;
END $$;

REVOKE EXECUTE ON FUNCTION public.search_clients(text), public.create_walkin_client(text,text,text), public.staff_create_appointment(uuid,uuid,timestamptz,uuid[],text,integer,integer,boolean), public.is_staff_booker() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.search_clients(text), public.create_walkin_client(text,text,text), public.staff_create_appointment(uuid,uuid,timestamptz,uuid[],text,integer,integer,boolean), public.is_staff_booker() TO authenticated;