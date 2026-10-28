CREATE OR REPLACE FUNCTION public.is_admin_or_leader()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(),'admin') OR EXISTS (
    SELECT 1 FROM public.barbers WHERE user_id = auth.uid() AND active AND approved_at IS NOT NULL
      AND archived_at IS NULL AND team_role IN ('lider','administrador','dono'))
$$;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_leader() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_or_leader() TO authenticated;

CREATE OR REPLACE FUNCTION public.register_counter_sale(_items jsonb, _method text, _client_name text, _seller_barber_id uuid, _bonus boolean, _note text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it jsonb; qty int; p public.products%ROWTYPE; sv public.services%ROWTYPE; eid uuid; n int := 0;
  cname text := left(trim(coalesce(_client_name,'')),120); nt text := left(trim(coalesce(_note,'')),300);
  pm text := CASE WHEN coalesce(_bonus,false) THEN NULL ELSE _method END; label text;
BEGIN
  IF NOT public.is_admin_or_leader() THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Escolha ao menos um item.' USING ERRCODE='P0001'; END IF;
  IF pm IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE id = pm AND active) THEN
    RAISE EXCEPTION 'Escolha a forma de pagamento.' USING ERRCODE='P0001'; END IF;
  IF _seller_barber_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.barbers WHERE id = _seller_barber_id) THEN
    RAISE EXCEPTION 'Barbeiro inválido.' USING ERRCODE='P0001'; END IF;
  label := CASE WHEN coalesce(_bonus,false) THEN 'Bonificação: ' ELSE '' END;
  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    qty := coalesce((it->>'qty')::int, 1);
    IF qty < 1 OR qty > 99 THEN RAISE EXCEPTION 'Quantidade inválida.' USING ERRCODE='P0001'; END IF;
    IF it->>'type' = 'produto' THEN
      SELECT * INTO p FROM public.products WHERE id = (it->>'id')::uuid AND active;
      IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE='P0001'; END IF;
      INSERT INTO public.financial_entries (kind, category, description, amount_cents, payment_method, occurred_at, client_name, seller_barber_id, received_by, note, product_id, quantity)
      VALUES ('entrada','produto', label || p.name, CASE WHEN _bonus THEN 0 ELSE p.price_cents * qty END, pm, now(), cname, _seller_barber_id, auth.uid(), nt, p.id, qty)
      RETURNING id INTO eid;
      INSERT INTO public.stock_movements (product_id, kind, quantity, unit_cost_cents, note, financial_entry_id, created_by)
      VALUES (p.id, CASE WHEN _bonus THEN 'consumo_interno' ELSE 'venda' END, qty, p.cost_cents,
        CASE WHEN _bonus THEN 'Bonificação' ELSE 'Venda de balcão' END || CASE WHEN cname <> '' THEN ' para ' || cname ELSE '' END, eid, auth.uid());
    ELSIF it->>'type' = 'servico' THEN
      SELECT * INTO sv FROM public.services WHERE id = (it->>'id')::uuid AND active;
      IF NOT FOUND THEN RAISE EXCEPTION 'Serviço não encontrado.' USING ERRCODE='P0001'; END IF;
      INSERT INTO public.financial_entries (kind, category, description, amount_cents, payment_method, occurred_at, client_name, barber_id, received_by, note, quantity)
      VALUES ('entrada','servico', label || sv.name, CASE WHEN _bonus THEN 0 ELSE sv.price_cents * qty END, pm, now(), cname, _seller_barber_id, auth.uid(), nt, qty);
    ELSE
      RAISE EXCEPTION 'Item inválido.' USING ERRCODE='P0001';
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.register_counter_sale(jsonb, text, text, uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_counter_sale(jsonb, text, text, uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_walkin_client(_first text, _last text, _whatsapp text)
 RETURNS TABLE(id uuid, code integer, existed boolean)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE f text := trim(coalesce(_first,'')); l text := trim(coalesce(_last,'')); w text := nullif(trim(coalesce(_whatsapp,'')),''); d text; hit record;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Somente o administrador cadastra cliente novo.' USING ERRCODE='42501'; END IF;
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
END $function$;