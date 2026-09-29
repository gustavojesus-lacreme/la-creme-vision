
ALTER TABLE public.barbers
  ADD COLUMN team_role text NOT NULL DEFAULT 'barbeiro' CHECK (team_role IN ('barbeiro','lider','administrador','dono')),
  ADD COLUMN commission_service_pct numeric CHECK (commission_service_pct IS NULL OR (commission_service_pct >= 0 AND commission_service_pct <= 100)),
  ADD COLUMN commission_plan_pct numeric CHECK (commission_plan_pct IS NULL OR (commission_plan_pct >= 0 AND commission_plan_pct <= 100));

-- Admin/dono profiles cannot hold individual percentages
CREATE OR REPLACE FUNCTION public.clear_commission_for_non_commissioned() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.team_role NOT IN ('barbeiro','lider') THEN
    NEW.commission_service_pct := NULL; NEW.commission_plan_pct := NULL;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER barbers_clear_commission BEFORE INSERT OR UPDATE ON public.barbers FOR EACH ROW EXECUTE FUNCTION public.clear_commission_for_non_commissioned();

-- Only barbeiro/líder (and not a system administrator) earn commission
CREATE OR REPLACE FUNCTION public.barber_commissionable(_barber_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = _barber_id AND b.team_role IN ('barbeiro','lider')
    AND (b.user_id IS NULL OR NOT has_role(b.user_id,'admin')))
$$;
REVOKE EXECUTE ON FUNCTION public.barber_commissionable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.barber_commissionable(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.compute_financial_entry()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE paid int; s public.operation_settings%ROWTYPE; recompute boolean; ppct numeric; b public.barbers%ROWTYPE; who uuid;
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
        who := CASE WHEN NEW.category = 'servico' THEN NEW.barber_id ELSE NEW.seller_barber_id END;
        b := NULL;
        IF who IS NOT NULL THEN SELECT * INTO b FROM public.barbers WHERE id = who; END IF;
        IF who IS NULL OR NOT public.barber_commissionable(who) THEN
          NEW.commission_barber_id := NULL; NEW.commission_percent := 0;
        ELSIF NEW.category = 'servico' THEN
          NEW.commission_barber_id := who; NEW.commission_percent := COALESCE(b.commission_service_pct, s.commission_service_pct, 50);
        ELSIF NEW.category = 'produto' THEN
          ppct := NULL;
          IF NEW.product_id IS NOT NULL THEN SELECT commission_pct INTO ppct FROM public.products WHERE id = NEW.product_id; END IF;
          NEW.commission_barber_id := who; NEW.commission_percent := COALESCE(ppct, s.commission_product_pct, 30);
        ELSIF NEW.category = 'plano' THEN
          NEW.commission_barber_id := who; NEW.commission_percent := COALESCE(b.commission_plan_pct, s.commission_plan_pct, 50);
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
