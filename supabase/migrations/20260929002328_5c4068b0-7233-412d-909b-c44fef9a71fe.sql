CREATE TABLE public.payment_methods (
  id text PRIMARY KEY,
  label text NOT NULL,
  fee_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (fee_percent >= 0 AND fee_percent < 100),
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0
);
GRANT SELECT, UPDATE ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY pm_read ON public.payment_methods FOR SELECT TO authenticated USING (true);
CREATE POLICY pm_admin_update ON public.payment_methods FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
INSERT INTO public.payment_methods (id,label,fee_percent,sort_order) VALUES
 ('pix','Pix',0,1),('dinheiro','Dinheiro',0,2),('debito','Cartão de débito',0,3),('credito','Cartão de crédito',0,4);

CREATE TABLE public.financial_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('entrada','saida')),
  category text NOT NULL,
  description text NOT NULL DEFAULT '',
  amount_cents int NOT NULL CHECK (amount_cents >= 0),
  discount_cents int NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  fee_cents int NOT NULL DEFAULT 0,
  payment_method text REFERENCES public.payment_methods(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  client_name text NOT NULL DEFAULT '',
  barber_id uuid REFERENCES public.barbers(id) ON DELETE SET NULL,
  seller_barber_id uuid REFERENCES public.barbers(id) ON DELETE SET NULL,
  received_by uuid,
  appointment_id uuid UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
  note text NOT NULL DEFAULT '',
  commission_barber_id uuid REFERENCES public.barbers(id) ON DELETE SET NULL,
  commission_cents int NOT NULL DEFAULT 0,
  commission_status text NOT NULL DEFAULT 'nenhuma' CHECK (commission_status IN ('nenhuma','pendente','paga')),
  commission_paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX financial_entries_occurred_idx ON public.financial_entries(occurred_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_entries TO authenticated;
GRANT ALL ON public.financial_entries TO service_role;
ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY fe_admin_all ON public.financial_entries FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY fe_barber_read ON public.financial_entries FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.barbers b WHERE b.user_id = auth.uid()
    AND b.id IN (financial_entries.barber_id, financial_entries.commission_barber_id)));

-- Cálculo automático de taxa e comissão (regras fixas da barbearia)
CREATE OR REPLACE FUNCTION public.compute_financial_entry()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE base int; pct numeric;
BEGIN
  base := GREATEST(NEW.amount_cents - NEW.discount_cents, 0);
  IF NEW.kind = 'entrada' THEN
    SELECT fee_percent INTO pct FROM public.payment_methods WHERE id = NEW.payment_method;
    NEW.fee_cents := round(base * COALESCE(pct,0) / 100);
    IF NEW.category = 'servico' AND NEW.barber_id IS NOT NULL THEN
      NEW.commission_barber_id := NEW.barber_id; NEW.commission_cents := round(base * 0.5);
    ELSIF NEW.category = 'produto' AND NEW.seller_barber_id IS NOT NULL THEN
      NEW.commission_barber_id := NEW.seller_barber_id; NEW.commission_cents := round(base * 0.3);
    ELSIF NEW.category = 'plano' AND NEW.seller_barber_id IS NOT NULL THEN
      NEW.commission_barber_id := NEW.seller_barber_id; NEW.commission_cents := round(base * 0.5);
    ELSE
      NEW.commission_barber_id := NULL; NEW.commission_cents := 0;
    END IF;
  ELSE
    NEW.fee_cents := 0; NEW.commission_barber_id := NULL; NEW.commission_cents := 0;
  END IF;
  IF NEW.commission_cents = 0 THEN NEW.commission_status := 'nenhuma'; NEW.commission_paid_at := NULL;
  ELSIF NEW.commission_status = 'nenhuma' THEN NEW.commission_status := 'pendente'; END IF;
  IF NEW.commission_status = 'paga' AND NEW.commission_paid_at IS NULL THEN NEW.commission_paid_at := now(); END IF;
  IF NEW.commission_status = 'pendente' THEN NEW.commission_paid_at := NULL; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;
CREATE TRIGGER financial_entries_compute BEFORE INSERT OR UPDATE ON public.financial_entries
  FOR EACH ROW EXECUTE FUNCTION public.compute_financial_entry();

-- Finalizar atendimento + registrar pagamento (atômico, sem duplicidade)
CREATE OR REPLACE FUNCTION public.finalize_appointment(_appointment_id uuid, _method text, _discount_cents int DEFAULT 0)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a public.appointments%ROWTYPE; is_admin boolean; amt int;
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
  INSERT INTO public.financial_entries (kind, category, description, amount_cents, discount_cents, payment_method,
    client_name, barber_id, received_by, appointment_id, occurred_at)
  VALUES ('entrada','servico', COALESCE(NULLIF(a.services_label,''),'Atendimento'), amt, _discount_cents, _method,
    trim(a.customer_first_name || ' ' || a.customer_last_name), a.barber_id, auth.uid(), a.id, now());
  UPDATE public.appointments SET status = 'finalizado' WHERE id = a.id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.finalize_appointment(uuid,text,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_appointment(uuid,text,int) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.compute_financial_entry() FROM PUBLIC, anon, authenticated;

-- Cancelamento/não comparecimento não gera faturamento
CREATE OR REPLACE FUNCTION public.remove_entry_on_cancel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status IN ('cancelado','nao_compareceu') AND OLD.status IS DISTINCT FROM NEW.status THEN
    DELETE FROM public.financial_entries WHERE appointment_id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.remove_entry_on_cancel() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER appointments_remove_entry AFTER UPDATE OF status ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.remove_entry_on_cancel();