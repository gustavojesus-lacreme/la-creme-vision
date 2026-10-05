UPDATE public.barber_absences SET kind = 'atestado' WHERE kind = 'saude';
UPDATE public.barber_absences SET kind = 'ausente' WHERE kind IN ('pausa','indisponivel');

CREATE OR REPLACE FUNCTION public.validate_absence()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF (TG_OP = 'INSERT' OR NEW.kind IS DISTINCT FROM OLD.kind)
     AND NEW.kind NOT IN ('ausente','ferias','atestado','emergencia') THEN
    RAISE EXCEPTION 'Motivo de ausência inválido.' USING ERRCODE='P0001'; END IF;
  IF NEW.kind = 'ferias' AND (TG_OP = 'INSERT' OR OLD.kind IS DISTINCT FROM 'ferias')
     AND NOT has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Somente a administração pode registrar férias.' USING ERRCODE='42501'; END IF;
  IF NEW.ends_on < NEW.starts_on THEN RAISE EXCEPTION 'Data final anterior à inicial.' USING ERRCODE='P0001'; END IF;
  IF (NEW.starts_time IS NULL) <> (NEW.ends_time IS NULL) THEN RAISE EXCEPTION 'Informe horário inicial e final.' USING ERRCODE='P0001'; END IF;
  IF NEW.starts_time IS NOT NULL AND NEW.ends_time <= NEW.starts_time THEN RAISE EXCEPTION 'Horário final deve ser depois do inicial.' USING ERRCODE='P0001'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(NEW.barber_id::text));
  IF EXISTS (SELECT 1 FROM public.barber_absences x WHERE x.barber_id = NEW.barber_id AND x.id <> NEW.id
      AND x.starts_on <= NEW.ends_on AND x.ends_on >= NEW.starts_on
      AND (x.starts_time IS NULL OR NEW.starts_time IS NULL OR (x.starts_time < NEW.ends_time AND x.ends_time > NEW.starts_time))) THEN
    RAISE EXCEPTION 'Já existe uma ausência que se sobrepõe a este período. Edite a ausência existente.' USING ERRCODE='P0001';
  END IF;
  IF TG_OP = 'INSERT' THEN NEW.created_by := auth.uid();
  ELSE NEW.created_by := OLD.created_by; NEW.updated_by := auth.uid(); END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $function$;

DROP POLICY IF EXISTS fe_barber_read ON public.financial_entries;
CREATE POLICY fe_barber_read ON public.financial_entries FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.barbers b WHERE b.user_id = auth.uid()
  AND b.id = ANY (ARRAY[financial_entries.barber_id, financial_entries.commission_barber_id, financial_entries.seller_barber_id])));

DROP FUNCTION IF EXISTS public.finalize_appointment(uuid, text, integer, jsonb);
CREATE FUNCTION public.finalize_appointment(_appointment_id uuid, _method text, _discount_cents integer DEFAULT 0, _products jsonb DEFAULT '[]'::jsonb, _services jsonb DEFAULT '[]'::jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE a public.appointments%ROWTYPE; is_admin boolean; amt int; item jsonb; p public.products%ROWTYPE;
  sv public.services%ROWTYPE; qty int; eid uuid; cname text; label text; extras text := '';
BEGIN
  SELECT * INTO a FROM public.appointments WHERE id = _appointment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agendamento não encontrado.' USING ERRCODE='P0001'; END IF;
  is_admin := has_role(auth.uid(),'admin');
  IF NOT is_admin AND NOT EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = a.barber_id AND b.user_id = auth.uid() AND b.active AND b.approved_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
  IF a.status <> 'agendado' THEN RAISE EXCEPTION 'Este atendimento já foi encerrado.' USING ERRCODE='P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE id = _method AND active) THEN
    RAISE EXCEPTION 'Forma de pagamento inválida.' USING ERRCODE='P0001'; END IF;
  amt := COALESCE(a.total_price_cents, (SELECT price_cents FROM public.services WHERE id = a.service_id), 0);
  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(_services,'[]'::jsonb)) LOOP
    qty := (item->>'quantity')::int;
    IF qty IS NULL OR qty <= 0 OR qty > 20 THEN RAISE EXCEPTION 'Quantidade de serviço inválida.' USING ERRCODE='P0001'; END IF;
    SELECT * INTO sv FROM public.services WHERE id = (item->>'service_id')::uuid AND active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Serviço indisponível.' USING ERRCODE='P0001'; END IF;
    amt := amt + sv.price_cents * qty;
    extras := extras || ' + ' || CASE WHEN qty > 1 THEN qty || 'x ' ELSE '' END || sv.name;
  END LOOP;
  IF _discount_cents < 0 OR _discount_cents > amt THEN RAISE EXCEPTION 'Desconto inválido.' USING ERRCODE='P0001'; END IF;
  cname := trim(a.customer_first_name || ' ' || a.customer_last_name);
  label := COALESCE(NULLIF(a.services_label,''),'Atendimento') || extras;
  INSERT INTO public.financial_entries (kind, category, description, amount_cents, discount_cents, payment_method,
    client_name, barber_id, received_by, appointment_id, occurred_at, note)
  VALUES ('entrada','servico', label, amt, _discount_cents, _method, cname, a.barber_id, auth.uid(), a.id, now(),
    CASE WHEN extras <> '' THEN 'Serviços adicionados na finalização:' || substr(extras, 3) ELSE '' END);
  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(_products,'[]'::jsonb)) LOOP
    qty := (item->>'quantity')::int;
    IF qty IS NULL OR qty <= 0 THEN RAISE EXCEPTION 'Quantidade de produto inválida.' USING ERRCODE='P0001'; END IF;
    SELECT * INTO p FROM public.products WHERE id = (item->>'product_id')::uuid FOR UPDATE;
    IF NOT FOUND OR NOT p.active THEN RAISE EXCEPTION 'Produto indisponível.' USING ERRCODE='P0001'; END IF;
    IF p.stock < qty THEN RAISE EXCEPTION 'Estoque insuficiente de %: disponível %.', p.name, p.stock USING ERRCODE='P0001'; END IF;
    INSERT INTO public.financial_entries (kind, category, description, amount_cents, discount_cents, payment_method,
      client_name, barber_id, seller_barber_id, received_by, appointment_id, occurred_at, product_id, quantity)
    VALUES ('entrada','produto', CASE WHEN qty > 1 THEN qty || 'x ' || p.name ELSE p.name END, p.price_cents * qty, 0, _method,
      cname, a.barber_id, a.barber_id, auth.uid(), a.id, now(), p.id, qty)
    RETURNING id INTO eid;
    INSERT INTO public.stock_movements (product_id, kind, quantity, unit_cost_cents, note, financial_entry_id, appointment_id, created_by)
    VALUES (p.id, 'venda', qty, p.cost_cents, 'Venda no atendimento de ' || cname, eid, a.id, auth.uid());
  END LOOP;
  UPDATE public.appointments SET status = 'finalizado' WHERE id = a.id;
END; $function$;
GRANT EXECUTE ON FUNCTION public.finalize_appointment(uuid, text, integer, jsonb, jsonb) TO authenticated;