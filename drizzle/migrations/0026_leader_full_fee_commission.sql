ALTER TABLE public.operation_settings ADD COLUMN IF NOT EXISTS leader_commission_service_pct numeric NOT NULL DEFAULT 65 CHECK (leader_commission_service_pct >= 0 AND leader_commission_service_pct <= 100);

CREATE OR REPLACE FUNCTION public.compute_financial_entry()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE paid int; s public.operation_settings%ROWTYPE; recompute boolean; ppct numeric; b public.barbers%ROWTYPE; who uuid; is_leader boolean;
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
          NEW.commission_barber_id := who;
          NEW.commission_percent := COALESCE(b.commission_service_pct,
            CASE WHEN b.team_role = 'lider' THEN s.leader_commission_service_pct ELSE s.commission_service_pct END, 50);
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
      is_leader := NEW.commission_barber_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.barbers WHERE id = NEW.commission_barber_id AND team_role = 'lider');
      IF is_leader THEN
        -- Líder/gerente: comissão sobre o valor pago e assume 100% da taxa da máquina.
        NEW.commission_cents := GREATEST(round(paid::numeric * NEW.commission_percent / 100) - NEW.fee_cents, 0);
      ELSE
        -- Barbeiro: comissão sobre o líquido (taxa dividida na proporção da comissão).
        NEW.commission_cents := round((paid - NEW.fee_cents)::numeric * NEW.commission_percent / 100);
      END IF;
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