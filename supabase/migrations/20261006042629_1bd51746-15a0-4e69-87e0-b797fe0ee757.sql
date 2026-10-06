-- 1) Cliente só pode cancelar o próprio agendamento; não altera preço, horário, barbeiro etc.
CREATE OR REPLACE FUNCTION public.guard_barber_appointment_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE is_barber boolean;
BEGIN
  IF auth.uid() IS NULL OR has_role(auth.uid(),'admin') THEN RETURN NEW; END IF;
  is_barber := EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = OLD.barber_id AND b.user_id = auth.uid());
  IF NOT is_barber AND OLD.user_id = auth.uid() THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status = 'agendado' AND NEW.status = 'cancelado') THEN
      RAISE EXCEPTION 'Sem permissão para alterar este agendamento.' USING ERRCODE='42501'; END IF;
  ELSE
    IF NEW.status = 'cancelado' AND OLD.status <> 'cancelado' THEN
      RAISE EXCEPTION 'Somente a administração pode cancelar agendamentos.' USING ERRCODE='42501'; END IF;
  END IF;
  IF NEW.barber_id IS DISTINCT FROM OLD.barber_id OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
     OR NEW.ends_at IS DISTINCT FROM OLD.ends_at OR NEW.service_ids IS DISTINCT FROM OLD.service_ids
     OR NEW.service_id IS DISTINCT FROM OLD.service_id OR NEW.services_label IS DISTINCT FROM OLD.services_label
     OR NEW.total_price_cents IS DISTINCT FROM OLD.total_price_cents OR NEW.total_duration_minutes IS DISTINCT FROM OLD.total_duration_minutes
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.customer_first_name IS DISTINCT FROM OLD.customer_first_name OR NEW.customer_last_name IS DISTINCT FROM OLD.customer_last_name
     OR NEW.customer_whatsapp IS DISTINCT FROM OLD.customer_whatsapp THEN
    RAISE EXCEPTION 'Sem permissão para alterar este agendamento.' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END; $$;

-- 2) Preço e duração do agendamento calculados no servidor (mesma regra de combinações da tela)
CREATE OR REPLACE FUNCTION public.compute_appointment_totals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE eff uuid[]; remaining uuid[]; names text[]; c record; exact record; price int := 0; dur int := 0;
BEGIN
  IF NEW.service_ids IS NULL OR array_length(NEW.service_ids,1) IS NULL THEN
    RAISE EXCEPTION 'Escolha os serviços.' USING ERRCODE='P0001'; END IF;
  IF (SELECT count(*) FROM public.services WHERE id = ANY(NEW.service_ids) AND active) <> (SELECT count(DISTINCT x) FROM unnest(NEW.service_ids) x) THEN
    RAISE EXCEPTION 'Serviço indisponível.' USING ERRCODE='P0001'; END IF;
  SELECT array_agg(lower(trim(name))) INTO names FROM public.services WHERE id = ANY(NEW.service_ids);
  SELECT array_agg(s.id) INTO eff FROM public.services s WHERE s.id = ANY(NEW.service_ids)
    AND NOT (lower(trim(s.name)) = 'pezinho' AND 'corte' = ANY(names))
    AND NOT (lower(trim(s.name)) = 'bigode' AND 'barba' = ANY(names));
  remaining := eff;
  SELECT * INTO exact FROM public.service_combos sc WHERE sc.active AND cardinality(sc.service_ids) > 0
    AND sc.service_ids @> remaining AND sc.service_ids <@ remaining AND cardinality(sc.service_ids) = cardinality(remaining) LIMIT 1;
  IF FOUND THEN
    price := exact.price_cents; dur := exact.duration_minutes; remaining := '{}';
  ELSE
    FOR c IN SELECT * FROM public.service_combos sc WHERE sc.active AND cardinality(sc.service_ids) > 0 ORDER BY cardinality(sc.service_ids) DESC, sc.created_at LOOP
      IF remaining @> c.service_ids THEN
        price := price + c.price_cents; dur := dur + c.duration_minutes;
        remaining := ARRAY(SELECT x FROM unnest(remaining) x WHERE x <> ALL(c.service_ids));
      END IF;
    END LOOP;
  END IF;
  SELECT price + COALESCE(sum(price_cents),0), dur + COALESCE(sum(duration_minutes),0) INTO price, dur
    FROM public.services WHERE id = ANY(remaining);
  NEW.total_price_cents := price;
  NEW.total_duration_minutes := dur;
  NEW.service_id := NEW.service_ids[1];
  NEW.ends_at := NEW.starts_at + make_interval(mins => dur);
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.compute_appointment_totals() FROM public, anon, authenticated;
CREATE TRIGGER appointments_aa_totals BEFORE INSERT ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.compute_appointment_totals();

-- 3) Taxas e configurações internas: só administração e barbeiros
DROP POLICY pm_read ON public.payment_methods;
CREATE POLICY pm_read ON public.payment_methods FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'barbeiro'));
DROP POLICY os_read ON public.operation_settings;
CREATE POLICY os_read ON public.operation_settings FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'barbeiro'));