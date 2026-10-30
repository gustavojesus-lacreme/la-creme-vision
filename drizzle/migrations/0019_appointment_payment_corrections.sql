CREATE TABLE public.financial_correction_permissions (
 barber_id uuid PRIMARY KEY REFERENCES public.barbers(id),
 granted_by uuid NOT NULL,
 granted_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_correction_permissions TO authenticated;
GRANT ALL ON public.financial_correction_permissions TO service_role;
ALTER TABLE public.financial_correction_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY correction_permissions_admin ON public.financial_correction_permissions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin') AND granted_by = auth.uid());
CREATE POLICY correction_permissions_own_read ON public.financial_correction_permissions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = barber_id AND b.user_id = auth.uid()));
CREATE FUNCTION public.can_correct_appointment_payment() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT auth.uid() IS NOT NULL AND (public.has_role(auth.uid(), 'admin') OR EXISTS (
 SELECT 1 FROM public.financial_correction_permissions p JOIN public.barbers b ON b.id=p.barber_id
 WHERE b.user_id=auth.uid() AND b.team_role='lider' AND b.active AND b.approved_at IS NOT NULL AND b.archived_at IS NULL AND public.has_role(auth.uid(),'barbeiro')));
$$;
REVOKE ALL ON FUNCTION public.can_correct_appointment_payment() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_correct_appointment_payment() TO authenticated;
CREATE FUNCTION public.set_financial_correction_permission(_barber_id uuid, _enabled boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Apenas o administrador pode autorizar líderes.' USING ERRCODE='42501'; END IF;
 IF _enabled THEN
  IF NOT EXISTS (SELECT 1 FROM public.barbers WHERE id=_barber_id AND team_role='lider' AND active AND approved_at IS NOT NULL AND archived_at IS NULL AND user_id IS NOT NULL) THEN RAISE EXCEPTION 'Selecione um líder ativo com conta vinculada.'; END IF;
  INSERT INTO public.financial_correction_permissions(barber_id,granted_by) VALUES (_barber_id,auth.uid()) ON CONFLICT (barber_id) DO UPDATE SET granted_by=auth.uid(),granted_at=now();
 ELSE DELETE FROM public.financial_correction_permissions WHERE barber_id=_barber_id;
 END IF;
END; $$;
REVOKE ALL ON FUNCTION public.set_financial_correction_permission(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_financial_correction_permission(uuid,boolean) TO authenticated;
CREATE TABLE public.financial_payment_corrections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 appointment_id uuid NOT NULL REFERENCES public.appointments(id),
 changed_by uuid NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now(),
 reason text NOT NULL,
 before_entries jsonb NOT NULL,
 after_entries jsonb NOT NULL
);
GRANT SELECT ON public.financial_payment_corrections TO authenticated;
GRANT ALL ON public.financial_payment_corrections TO service_role;
ALTER TABLE public.financial_payment_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_corrections_read ON public.financial_payment_corrections FOR SELECT TO authenticated USING(public.can_correct_appointment_payment());
CREATE FUNCTION public.list_correctable_payment_entries(_from timestamptz,_to timestamptz) RETURNS SETOF public.financial_entries LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.can_correct_appointment_payment() THEN RAISE EXCEPTION 'Sem autorização para corrigir pagamentos.' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT f.* FROM public.financial_entries f JOIN public.appointments a ON a.id=f.appointment_id WHERE a.status='finalizado' AND f.kind='entrada' AND f.refunded_at IS NULL AND f.occurred_at>=_from AND f.occurred_at<_to ORDER BY f.occurred_at DESC;
END; $$;
REVOKE ALL ON FUNCTION public.list_correctable_payment_entries(timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_correctable_payment_entries(timestamptz,timestamptz) TO authenticated;
CREATE FUNCTION public.correct_appointment_payment(_appointment_id uuid,_method text,_reason text,_expected jsonb,_cash_received_cents integer DEFAULT NULL,_change_method text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE before_rows jsonb; after_rows jsonb; total_paid integer; change_value integer; service_entry uuid; current_method text;
BEGIN
 IF NOT public.can_correct_appointment_payment() THEN RAISE EXCEPTION 'Sem autorização para corrigir pagamentos.' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(_reason,'')))<3 OR length(_reason)>300 THEN RAISE EXCEPTION 'Informe o motivo da correção (3 a 300 caracteres).'; END IF;
 PERFORM 1 FROM public.appointments WHERE id=_appointment_id AND status='finalizado' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Só é possível corrigir atendimentos finalizados.'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE id=_method AND active) THEN RAISE EXCEPTION 'Forma de pagamento inválida ou desativada.'; END IF;
 PERFORM id FROM public.financial_entries WHERE appointment_id=_appointment_id AND kind='entrada' AND refunded_at IS NULL ORDER BY id FOR UPDATE;
 SELECT jsonb_agg(to_jsonb(f) ORDER BY f.id),sum(f.amount_cents-f.discount_cents) INTO before_rows,total_paid FROM public.financial_entries f WHERE f.appointment_id=_appointment_id AND f.kind='entrada' AND f.refunded_at IS NULL;
 IF before_rows IS NULL THEN RAISE EXCEPTION 'Atendimento sem lançamentos financeiros.'; END IF;
 IF _expected IS NULL OR _expected IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_object('id',f.id,'updated_at',f.updated_at) ORDER BY f.id) FROM public.financial_entries f WHERE f.appointment_id=_appointment_id AND f.kind='entrada' AND f.refunded_at IS NULL) THEN RAISE EXCEPTION 'Este pagamento foi alterado. Feche e abra novamente antes de corrigir.'; END IF;
 SELECT id,payment_method INTO service_entry,current_method FROM public.financial_entries WHERE appointment_id=_appointment_id AND kind='entrada' AND category='servico' AND refunded_at IS NULL ORDER BY id LIMIT 1;
 IF _cash_received_cents IS NOT NULL THEN
  IF _method<>'dinheiro' OR service_entry IS NULL OR _cash_received_cents<=total_paid OR coalesce(_change_method,'') NOT IN ('pix','dinheiro') THEN RAISE EXCEPTION 'Confira o dinheiro recebido e a forma de troco.'; END IF;
  change_value:=_cash_received_cents-total_paid;
 END IF;
 UPDATE public.financial_entries SET payment_method=_method,
 cash_received_cents=CASE WHEN id=service_entry AND _method='dinheiro' THEN _cash_received_cents ELSE NULL END,
 change_cents=CASE WHEN id=service_entry AND _method='dinheiro' THEN change_value ELSE NULL END,
 change_method=CASE WHEN id=service_entry AND _method='dinheiro' THEN _change_method ELSE NULL END
 WHERE appointment_id=_appointment_id AND kind='entrada' AND refunded_at IS NULL;
 SELECT jsonb_agg(to_jsonb(f) ORDER BY f.id) INTO after_rows FROM public.financial_entries f WHERE f.appointment_id=_appointment_id AND f.kind='entrada' AND f.refunded_at IS NULL;
 INSERT INTO public.financial_payment_corrections(appointment_id,changed_by,reason,before_entries,after_entries) VALUES(_appointment_id,auth.uid(),btrim(_reason),before_rows,after_rows);
END; $$;
REVOKE ALL ON FUNCTION public.correct_appointment_payment(uuid,text,text,jsonb,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.correct_appointment_payment(uuid,text,text,jsonb,integer,text) TO authenticated;