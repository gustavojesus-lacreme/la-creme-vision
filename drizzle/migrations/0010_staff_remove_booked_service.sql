CREATE OR REPLACE FUNCTION public.remove_appointment_service(_appointment_id uuid, _service_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.appointments%ROWTYPE; ids uuid[]; remaining uuid[]; c record; exact record; price int:=0; dur int:=0; label text; covered uuid[]; disc int; cp public.client_plans%ROWTYPE;
BEGIN
 SELECT * INTO a FROM public.appointments WHERE id=_appointment_id FOR UPDATE;
 IF NOT FOUND OR a.status <> 'agendado' THEN RAISE EXCEPTION 'Só é possível retirar serviços de atendimento agendado.'; END IF;
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR EXISTS(SELECT 1 FROM public.barbers WHERE id=a.barber_id AND user_id=auth.uid() AND active AND approved_at IS NOT NULL AND archived_at IS NULL)) THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
 IF NOT (_service_id=ANY(a.service_ids)) THEN RAISE EXCEPTION 'Serviço não pertence ao atendimento.'; END IF;
 ids:=array_remove(a.service_ids,_service_id);
 IF cardinality(ids)=0 THEN RAISE EXCEPTION 'Mantenha pelo menos um serviço no atendimento.'; END IF;
 remaining:=ARRAY(SELECT s.id FROM public.services s WHERE s.id=ANY(ids) AND NOT(lower(trim(s.name))='pezinho' AND EXISTS(SELECT 1 FROM public.services WHERE id=ANY(ids) AND lower(trim(name))='corte')) AND NOT(lower(trim(s.name))='bigode' AND EXISTS(SELECT 1 FROM public.services WHERE id=ANY(ids) AND lower(trim(name))='barba')));
 SELECT * INTO exact FROM public.service_combos sc WHERE active AND cardinality(service_ids)>0 AND service_ids @> remaining AND service_ids <@ remaining AND cardinality(service_ids)=cardinality(remaining) LIMIT 1;
 IF FOUND THEN price:=exact.price_cents; dur:=exact.duration_minutes; remaining:='{}';
 ELSE FOR c IN SELECT * FROM public.service_combos WHERE active AND cardinality(service_ids)>0 ORDER BY cardinality(service_ids) DESC,created_at LOOP
 IF remaining @> c.service_ids THEN price:=price+c.price_cents; dur:=dur+c.duration_minutes; remaining:=ARRAY(SELECT x FROM unnest(remaining) x WHERE x<>ALL(c.service_ids)); END IF;
 END LOOP; END IF;
 SELECT price+coalesce(sum(price_cents),0),dur+coalesce(sum(duration_minutes),0) INTO price,dur FROM public.services WHERE id=ANY(remaining);
 SELECT string_agg(name,' + ' ORDER BY sort_order) INTO label FROM public.services WHERE id=ANY(ids);
 IF a.client_plan_id IS NOT NULL THEN
 SELECT * INTO cp FROM public.client_plans WHERE id=a.client_plan_id FOR UPDATE;
 IF cp.plan_id IS NOT NULL THEN SELECT array_agg(service_id) INTO covered FROM public.plan_items WHERE plan_id=cp.plan_id; END IF;
 IF covered IS NULL THEN SELECT array_agg(id) INTO covered FROM public.services WHERE lower(trim(name))='corte'; END IF;
 SELECT coalesce(sum(price_cents),0) INTO disc FROM public.services WHERE id=ANY(ids) AND id=ANY(covered);
 price:=greatest(0,price-disc);
 IF disc=0 THEN UPDATE public.client_plans SET used_uses=greatest(0,used_uses-1) WHERE id=cp.id; a.client_plan_id:=NULL; END IF;
 END IF;
 PERFORM set_config('app.removing_service',a.id::text,true);
 UPDATE public.appointments SET service_ids=ids,service_id=ids[1],services_label=label,total_price_cents=price,total_duration_minutes=dur,ends_at=starts_at+make_interval(mins=>dur),client_plan_id=a.client_plan_id WHERE id=a.id;
 PERFORM set_config('app.removing_service','',true);
END $$;
REVOKE ALL ON FUNCTION public.remove_appointment_service(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.remove_appointment_service(uuid,uuid) TO authenticated;
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('public.guard_barber_appointment_update()'::regprocedure) INTO def;
 def:=replace(def,'  IF NEW.barber_id IS DISTINCT FROM OLD.barber_id', E'  IF current_setting(''app.removing_service'', true) = OLD.id::text\n     AND OLD.status = ''agendado'' AND NEW.service_ids <@ OLD.service_ids AND cardinality(NEW.service_ids) > 0\n     AND (to_jsonb(NEW) - ARRAY[''service_ids'',''service_id'',''services_label'',''total_price_cents'',''total_duration_minutes'',''ends_at'',''client_plan_id'']) = (to_jsonb(OLD) - ARRAY[''service_ids'',''service_id'',''services_label'',''total_price_cents'',''total_duration_minutes'',''ends_at'',''client_plan_id''])\n     AND EXISTS(SELECT 1 FROM public.barbers WHERE id=OLD.barber_id AND user_id=auth.uid() AND active AND approved_at IS NOT NULL AND archived_at IS NULL) THEN RETURN NEW; END IF;\n  IF NEW.barber_id IS DISTINCT FROM OLD.barber_id');
 EXECUTE def;
END $$;