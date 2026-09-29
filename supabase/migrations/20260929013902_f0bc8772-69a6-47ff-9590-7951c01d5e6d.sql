ALTER TABLE public.financial_entries
  ADD COLUMN IF NOT EXISTS fee_percent numeric(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_percent numeric(6,2) NOT NULL DEFAULT 0;

ALTER TABLE public.operation_settings
  ADD COLUMN IF NOT EXISTS commission_service_pct numeric(6,2) NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS commission_product_pct numeric(6,2) NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS commission_plan_pct numeric(6,2) NOT NULL DEFAULT 50;

ALTER TABLE public.operation_settings DROP CONSTRAINT IF EXISTS operation_settings_commission_range;
ALTER TABLE public.operation_settings ADD CONSTRAINT operation_settings_commission_range CHECK (
  commission_service_pct BETWEEN 0 AND 100 AND commission_product_pct BETWEEN 0 AND 100 AND commission_plan_pct BETWEEN 0 AND 100);

ALTER TABLE public.payment_methods DROP CONSTRAINT IF EXISTS payment_methods_fee_range;
ALTER TABLE public.payment_methods ADD CONSTRAINT payment_methods_fee_range CHECK (fee_percent BETWEEN 0 AND 100);

DROP TRIGGER IF EXISTS financial_entries_compute ON public.financial_entries;

-- Backfill existing entries with current rates (one time)
UPDATE public.financial_entries fe SET
  fee_percent = COALESCE((SELECT pm.fee_percent FROM public.payment_methods pm WHERE pm.id = fe.payment_method), 0),
  commission_percent = CASE
    WHEN fe.category = 'servico' AND fe.barber_id IS NOT NULL THEN 50
    WHEN fe.category = 'produto' AND fe.seller_barber_id IS NOT NULL THEN 30
    WHEN fe.category = 'plano' AND fe.seller_barber_id IS NOT NULL THEN 50
    ELSE 0 END
WHERE kind = 'entrada';
UPDATE public.financial_entries SET
  fee_cents = round(GREATEST(amount_cents - discount_cents,0)::numeric * fee_percent / 100)
WHERE kind = 'entrada';
UPDATE public.financial_entries SET
  commission_cents = round((GREATEST(amount_cents - discount_cents,0) - fee_cents)::numeric * commission_percent / 100)
WHERE kind = 'entrada';

CREATE OR REPLACE FUNCTION public.compute_financial_entry()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE paid int; s public.operation_settings%ROWTYPE; recompute boolean;
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
      -- Snapshot fee rate only when new or payment method changed; otherwise keep the recorded rate
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
          NEW.commission_barber_id := NEW.seller_barber_id; NEW.commission_percent := COALESCE(s.commission_product_pct, 30);
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
  IF NEW.commission_cents = 0 THEN NEW.commission_status := 'nenhuma'; NEW.commission_paid_at := NULL;
  ELSIF NEW.commission_status = 'nenhuma' THEN NEW.commission_status := 'pendente'; END IF;
  IF NEW.commission_status = 'paga' AND NEW.commission_paid_at IS NULL THEN NEW.commission_paid_at := now(); END IF;
  IF NEW.commission_status = 'pendente' THEN NEW.commission_paid_at := NULL; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $function$;

CREATE TRIGGER financial_entries_compute BEFORE INSERT OR UPDATE ON public.financial_entries
  FOR EACH ROW EXECUTE FUNCTION public.compute_financial_entry();