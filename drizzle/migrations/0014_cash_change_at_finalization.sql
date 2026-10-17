ALTER TABLE public.financial_entries ADD COLUMN cash_received_cents integer, ADD COLUMN change_cents integer, ADD COLUMN change_method text;
ALTER TABLE public.financial_entries ADD CONSTRAINT valid_cash_change CHECK ((cash_received_cents IS NULL AND change_cents IS NULL AND change_method IS NULL) OR (payment_method='dinheiro' AND category='servico' AND cash_received_cents>=0 AND change_cents>=0 AND change_method IN ('dinheiro','pix')));
CREATE OR REPLACE FUNCTION public.finalize_appointment_with_change(_appointment_id uuid, _method text, _discount_cents integer DEFAULT 0, _products jsonb DEFAULT '[]'::jsonb, _services jsonb DEFAULT '[]'::jsonb, _cash_received_cents integer DEFAULT NULL, _change_method text DEFAULT 'dinheiro') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE total_due bigint;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta.' USING ERRCODE='42501'; END IF;
 IF _cash_received_cents IS NOT NULL AND (_method <> 'dinheiro' OR _cash_received_cents < 0 OR _change_method IS NULL OR _change_method NOT IN ('dinheiro','pix')) THEN RAISE EXCEPTION 'Dados de troco inválidos.'; END IF;
 PERFORM public.finalize_appointment(_appointment_id,_method,_discount_cents,_products,_services);
 IF _cash_received_cents IS NOT NULL THEN
  SELECT COALESCE(sum(amount_cents-discount_cents),0) INTO total_due FROM public.financial_entries WHERE appointment_id=_appointment_id AND kind='entrada' AND refunded_at IS NULL;
  IF _cash_received_cents < total_due THEN RAISE EXCEPTION 'O valor recebido deve cobrir o total do atendimento.'; END IF;
  UPDATE public.financial_entries SET cash_received_cents=_cash_received_cents,change_cents=_cash_received_cents-total_due,change_method=_change_method WHERE appointment_id=_appointment_id AND kind='entrada' AND category='servico';
 END IF;
END; $$;
REVOKE ALL ON FUNCTION public.finalize_appointment_with_change(uuid,text,integer,jsonb,jsonb,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finalize_appointment_with_change(uuid,text,integer,jsonb,jsonb,integer,text) TO authenticated,service_role;
COMMENT ON COLUMN public.financial_entries.change_cents IS 'Operational cash change only, not a discount or extra expense. Revenue and commission remain based on the sale.';