CREATE OR REPLACE FUNCTION public.extra_service_price(_service_id uuid, _context uuid[])
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT LEAST(
    (SELECT price_cents FROM public.services WHERE id = _service_id),
    COALESCE((SELECT min((c.item_prices->>_service_id::text)::int) FROM public.service_combos c
      WHERE c.active AND _service_id = ANY(c.service_ids) AND c.item_prices ? _service_id::text
        AND c.service_ids <@ (_context || _service_id)), 2147483647))
$$;
GRANT EXECUTE ON FUNCTION public.extra_service_price(uuid, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.finalize_appointment(_appointment_id uuid, _method text, _discount_cents integer DEFAULT 0, _products jsonb DEFAULT '[]'::jsonb, _services jsonb DEFAULT '[]'::jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE a public.appointments%ROWTYPE; is_admin boolean; amt int; item jsonb; p public.products%ROWTYPE;
  sv public.services%ROWTYPE; qty int; eid uuid; cname text; label text; extras text := ''; ctx uuid[];
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
  ctx := COALESCE(a.service_ids, ARRAY[a.service_id]) || COALESCE((SELECT array_agg((e->>'service_id')::uuid) FROM jsonb_array_elements(COALESCE(_services,'[]'::jsonb)) e), '{}');
  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(_services,'[]'::jsonb)) LOOP
    qty := (item->>'quantity')::int;
    IF qty IS NULL OR qty <= 0 OR qty > 20 THEN RAISE EXCEPTION 'Quantidade de serviço inválida.' USING ERRCODE='P0001'; END IF;
    SELECT * INTO sv FROM public.services WHERE id = (item->>'service_id')::uuid AND active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Serviço indisponível.' USING ERRCODE='P0001'; END IF;
    amt := amt + public.extra_service_price(sv.id, array_remove(ctx, sv.id)) + sv.price_cents * (qty - 1);
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