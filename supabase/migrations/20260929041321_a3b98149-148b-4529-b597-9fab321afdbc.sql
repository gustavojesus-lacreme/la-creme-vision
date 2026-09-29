
ALTER TABLE public.barbers ADD COLUMN color text NOT NULL DEFAULT '';

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT '',
  sku text NOT NULL DEFAULT '',
  price_cents integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  cost_cents integer NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  min_stock integer NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  commission_pct numeric NOT NULL DEFAULT 30 CHECK (commission_pct >= 0 AND commission_pct <= 100),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY products_admin_select ON public.products FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY products_admin_insert ON public.products FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin') AND stock = 0);
CREATE POLICY products_admin_update ON public.products FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- Stock can only change through movements
CREATE OR REPLACE FUNCTION public.guard_product_stock() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.stock IS DISTINCT FROM OLD.stock AND current_setting('app.stock_move', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'O estoque só pode ser alterado por movimentações.' USING ERRCODE='P0001';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;
CREATE TRIGGER products_guard BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.guard_product_stock();

ALTER TABLE public.financial_entries
  ADD COLUMN product_id uuid REFERENCES public.products(id),
  ADD COLUMN quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN refunded_at timestamptz,
  ADD COLUMN refunded_by uuid;

CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id),
  kind text NOT NULL CHECK (kind IN ('entrada','ajuste_positivo','ajuste_negativo','perda','avaria','consumo_interno','venda','estorno')),
  quantity integer NOT NULL CHECK (quantity <> 0),
  unit_cost_cents integer,
  note text NOT NULL DEFAULT '',
  financial_entry_id uuid REFERENCES public.financial_entries(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  balance_after integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY sm_admin_select ON public.stock_movements FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.apply_stock_movement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cur int;
BEGIN
  IF NEW.kind IN ('entrada','ajuste_positivo','estorno') AND NEW.quantity < 0 THEN NEW.quantity := -NEW.quantity; END IF;
  IF NEW.kind IN ('ajuste_negativo','perda','avaria','consumo_interno','venda') AND NEW.quantity > 0 THEN NEW.quantity := -NEW.quantity; END IF;
  SELECT stock INTO cur FROM public.products WHERE id = NEW.product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE='P0001'; END IF;
  IF cur + NEW.quantity < 0 THEN RAISE EXCEPTION 'Estoque insuficiente.' USING ERRCODE='P0001'; END IF;
  PERFORM set_config('app.stock_move','1',true);
  UPDATE public.products SET stock = cur + NEW.quantity WHERE id = NEW.product_id;
  PERFORM set_config('app.stock_move','0',true);
  NEW.balance_after := cur + NEW.quantity;
  NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  RETURN NEW;
END; $$;
CREATE TRIGGER stock_movements_apply BEFORE INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

-- Admin manual movement (entrada, ajustes, perdas)
CREATE OR REPLACE FUNCTION public.register_stock_movement(_product_id uuid, _kind text, _quantity integer, _unit_cost_cents integer DEFAULT NULL, _note text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
  IF _kind NOT IN ('entrada','ajuste_positivo','ajuste_negativo','perda','avaria','consumo_interno') THEN
    RAISE EXCEPTION 'Tipo de movimentação inválido.' USING ERRCODE='P0001'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Informe uma quantidade maior que zero.' USING ERRCODE='P0001'; END IF;
  INSERT INTO public.stock_movements (product_id, kind, quantity, unit_cost_cents, note, created_by)
  VALUES (_product_id, _kind, _quantity, _unit_cost_cents, COALESCE(_note,''), auth.uid());
  IF _kind = 'entrada' AND _unit_cost_cents IS NOT NULL AND _unit_cost_cents >= 0 THEN
    UPDATE public.products SET cost_cents = _unit_cost_cents WHERE id = _product_id;
  END IF;
END; $$;

-- Products available for sale (no cost/commission exposed)
CREATE OR REPLACE FUNCTION public.get_sellable_products()
RETURNS TABLE(id uuid, name text, category text, price_cents integer, stock integer, low boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.name, p.category, p.price_cents, p.stock, p.stock <= p.min_stock
  FROM public.products p
  WHERE p.active AND p.stock > 0
    AND (has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.barbers b WHERE b.user_id = auth.uid() AND b.active AND b.approved_at IS NOT NULL))
  ORDER BY p.name
$$;

-- Commission uses per-product percentage; refunded entries lose commission
CREATE OR REPLACE FUNCTION public.compute_financial_entry()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE paid int; s public.operation_settings%ROWTYPE; recompute boolean; ppct numeric;
BEGIN
  IF NEW.discount_cents < 0 OR NEW.discount_cents > NEW.amount_cents THEN
    RAISE EXCEPTION 'Desconto inválido.' USING ERRCODE='P0001';
  END IF;
  paid := GREATEST(NEW.amount_cents - NEW.discount_cents, 0);
  IF NEW.kind = 'entrada' THEN
    recompute := TG_OP = 'INSERT'
      OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
      OR NEW.discount_cents IS DISTINCT FROM OLD.discount_cents
      OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
      OR NEW.category IS DISTINCT FROM OLD.category
      OR NEW.barber_id IS DISTINCT FROM OLD.barber_id
      OR NEW.seller_barber_id IS DISTINCT FROM OLD.seller_barber_id;
    IF recompute THEN
      IF TG_OP = 'INSERT' OR NEW.payment_method IS DISTINCT FROM OLD.payment_method THEN
        SELECT fee_percent INTO NEW.fee_percent FROM public.payment_methods WHERE id = NEW.payment_method;
        NEW.fee_percent := COALESCE(NEW.fee_percent, 0);
      ELSE
        NEW.fee_percent := OLD.fee_percent;
      END IF;
      NEW.fee_cents := round(paid::numeric * NEW.fee_percent / 100);
      IF TG_OP = 'INSERT' OR NEW.category IS DISTINCT FROM OLD.category
         OR NEW.barber_id IS DISTINCT FROM OLD.barber_id OR NEW.seller_barber_id IS DISTINCT FROM OLD.seller_barber_id THEN
        SELECT * INTO s FROM public.operation_settings ORDER BY id LIMIT 1;
        IF NEW.category = 'servico' AND NEW.barber_id IS NOT NULL THEN
          NEW.commission_barber_id := NEW.barber_id; NEW.commission_percent := COALESCE(s.commission_service_pct, 50);
        ELSIF NEW.category = 'produto' AND NEW.seller_barber_id IS NOT NULL THEN
          ppct := NULL;
          IF NEW.product_id IS NOT NULL THEN SELECT commission_pct INTO ppct FROM public.products WHERE id = NEW.product_id; END IF;
          NEW.commission_barber_id := NEW.seller_barber_id; NEW.commission_percent := COALESCE(ppct, s.commission_product_pct, 30);
        ELSIF NEW.category = 'plano' AND NEW.seller_barber_id IS NOT NULL THEN
          NEW.commission_barber_id := NEW.seller_barber_id; NEW.commission_percent := COALESCE(s.commission_plan_pct, 50);
        ELSE
          NEW.commission_barber_id := NULL; NEW.commission_percent := 0;
        END IF;
      ELSE
        NEW.commission_percent := OLD.commission_percent;
        NEW.commission_barber_id := OLD.commission_barber_id;
      END IF;
      NEW.commission_cents := round((paid - NEW.fee_cents)::numeric * NEW.commission_percent / 100);
    ELSE
      NEW.fee_percent := OLD.fee_percent; NEW.fee_cents := OLD.fee_cents;
      NEW.commission_percent := OLD.commission_percent; NEW.commission_cents := OLD.commission_cents;
      NEW.commission_barber_id := OLD.commission_barber_id;
    END IF;
  ELSE
    NEW.fee_cents := 0; NEW.fee_percent := 0; NEW.commission_barber_id := NULL;
    NEW.commission_cents := 0; NEW.commission_percent := 0;
  END IF;
  IF NEW.refunded_at IS NOT NULL THEN NEW.commission_cents := 0; END IF;
  IF NEW.commission_cents = 0 THEN NEW.commission_status := 'nenhuma'; NEW.commission_paid_at := NULL;
  ELSIF NEW.commission_status = 'nenhuma' THEN NEW.commission_status := 'pendente'; END IF;
  IF NEW.commission_status = 'paga' AND NEW.commission_paid_at IS NULL THEN NEW.commission_paid_at := now(); END IF;
  IF NEW.commission_status = 'pendente' THEN NEW.commission_paid_at := NULL; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $function$;

DROP FUNCTION IF EXISTS public.finalize_appointment(uuid, text, integer);
CREATE OR REPLACE FUNCTION public.finalize_appointment(_appointment_id uuid, _method text, _discount_cents integer DEFAULT 0, _products jsonb DEFAULT '[]'::jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE a public.appointments%ROWTYPE; is_admin boolean; amt int; item jsonb; p public.products%ROWTYPE; qty int; eid uuid; cname text;
BEGIN
  SELECT * INTO a FROM public.appointments WHERE id = _appointment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agendamento não encontrado.' USING ERRCODE='P0001'; END IF;
  is_admin := has_role(auth.uid(),'admin');
  IF NOT is_admin AND NOT EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = a.barber_id AND b.user_id = auth.uid() AND b.active AND b.approved_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501';
  END IF;
  IF a.status <> 'agendado' THEN RAISE EXCEPTION 'Este atendimento já foi encerrado.' USING ERRCODE='P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE id = _method AND active) THEN
    RAISE EXCEPTION 'Forma de pagamento inválida.' USING ERRCODE='P0001'; END IF;
  amt := COALESCE(a.total_price_cents, (SELECT price_cents FROM public.services WHERE id = a.service_id), 0);
  IF _discount_cents < 0 OR _discount_cents > amt THEN RAISE EXCEPTION 'Desconto inválido.' USING ERRCODE='P0001'; END IF;
  cname := trim(a.customer_first_name || ' ' || a.customer_last_name);
  INSERT INTO public.financial_entries (kind, category, description, amount_cents, discount_cents, payment_method,
    client_name, barber_id, received_by, appointment_id, occurred_at)
  VALUES ('entrada','servico', COALESCE(NULLIF(a.services_label,''),'Atendimento'), amt, _discount_cents, _method,
    cname, a.barber_id, auth.uid(), a.id, now());
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

CREATE OR REPLACE FUNCTION public.refund_product_sale(_entry_id uuid, _note text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.financial_entries%ROWTYPE;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
  SELECT * INTO e FROM public.financial_entries WHERE id = _entry_id FOR UPDATE;
  IF NOT FOUND OR e.product_id IS NULL THEN RAISE EXCEPTION 'Venda de produto não encontrada.' USING ERRCODE='P0001'; END IF;
  IF e.refunded_at IS NOT NULL THEN RAISE EXCEPTION 'Esta venda já foi estornada.' USING ERRCODE='P0001'; END IF;
  UPDATE public.financial_entries SET refunded_at = now(), refunded_by = auth.uid(),
    note = trim(both ' ' from note || ' Estorno: ' || COALESCE(NULLIF(_note,''),'sem observação')) WHERE id = e.id;
  INSERT INTO public.stock_movements (product_id, kind, quantity, note, financial_entry_id, appointment_id, created_by)
  VALUES (e.product_id, 'estorno', e.quantity, 'Estorno de venda' || CASE WHEN _note <> '' THEN ': ' || _note ELSE '' END, e.id, e.appointment_id, auth.uid());
END; $$;

-- Cancel after finalize: product sales are refunded (restocked), not silently deleted
CREATE OR REPLACE FUNCTION public.remove_entry_on_cancel()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE e record;
BEGIN
  IF NEW.status IN ('cancelado','nao_compareceu') AND OLD.status IS DISTINCT FROM NEW.status THEN
    FOR e IN SELECT id, product_id, quantity FROM public.financial_entries
      WHERE appointment_id = NEW.id AND product_id IS NOT NULL AND refunded_at IS NULL LOOP
      UPDATE public.financial_entries SET refunded_at = now(), refunded_by = auth.uid() WHERE id = e.id;
      INSERT INTO public.stock_movements (product_id, kind, quantity, note, financial_entry_id, appointment_id, created_by)
      VALUES (e.product_id, 'estorno', e.quantity, 'Estorno por cancelamento do atendimento', e.id, NEW.id, auth.uid());
    END LOOP;
    DELETE FROM public.financial_entries WHERE appointment_id = NEW.id AND product_id IS NULL;
  END IF;
  RETURN NEW;
END; $function$;
