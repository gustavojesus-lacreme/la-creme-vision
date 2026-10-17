CREATE OR REPLACE FUNCTION public.can_edit_appointment(_barber_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT auth.uid() IS NOT NULL AND (public.has_role(auth.uid(),'admin') OR EXISTS(SELECT 1 FROM public.barbers WHERE id=_barber_id AND user_id=auth.uid() AND active AND approved_at IS NOT NULL AND archived_at IS NULL AND team_role IN ('lider','administrador','dono'))) $$;
REVOKE ALL ON FUNCTION public.can_edit_appointment(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.can_edit_appointment(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.edit_appointment(_id uuid,_first text,_last text,_starts_at timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.appointments%ROWTYPE; finish timestamptz; d date; s public.operation_settings%ROWTYPE;
BEGIN
 SELECT * INTO a FROM public.appointments WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR NOT public.can_edit_appointment(a.barber_id) THEN RAISE EXCEPTION 'Sem permissão para editar este agendamento.' USING ERRCODE='42501'; END IF;
 IF a.status<>'agendado' THEN RAISE EXCEPTION 'Só é possível editar atendimento agendado.'; END IF;
 IF length(trim(coalesce(_first,'')))<1 OR length(_first)>60 OR length(coalesce(_last,''))>60 OR _starts_at IS NULL THEN RAISE EXCEPTION 'Informe nome e horário válidos.'; END IF;
 finish:=_starts_at+(a.ends_at-a.starts_at); d:=(_starts_at AT TIME ZONE 'America/Sao_Paulo')::date;
 IF _starts_at IS DISTINCT FROM a.starts_at THEN
 PERFORM pg_advisory_xact_lock(hashtext(a.barber_id::text));
 IF NOT public.is_barber_bookable(a.barber_id) OR EXISTS(SELECT 1 FROM public.shop_blocked_dates WHERE day=d) THEN RAISE EXCEPTION 'Data ou barbeiro indisponível.'; END IF;
 IF NOT a.is_walkin THEN
 SELECT * INTO s FROM public.operation_settings WHERE id=1;
 IF _starts_at < now()+make_interval(mins=>s.min_advance_minutes) OR (s.max_advance_days IS NOT NULL AND d>(now() AT TIME ZONE 'America/Sao_Paulo')::date+s.max_advance_days)
 OR NOT EXISTS(SELECT 1 FROM public.business_periods WHERE weekday=extract(dow FROM d) AND _starts_at >= (d+opens_at) AT TIME ZONE 'America/Sao_Paulo' AND finish <= (d+closes_at) AT TIME ZONE 'America/Sao_Paulo')
 OR EXISTS(SELECT 1 FROM public.business_hours WHERE weekday=extract(dow FROM d) AND closed)
 OR EXISTS(SELECT 1 FROM public.services WHERE id=ANY(a.service_ids) AND latest_start_time IS NOT NULL AND (_starts_at AT TIME ZONE 'America/Sao_Paulo')::time>latest_start_time)
 OR EXISTS(SELECT 1 FROM public.barber_absences WHERE barber_id=a.barber_id AND starts_on<=d AND ends_on>=d AND (starts_time IS NULL OR (_starts_at < (d+ends_time) AT TIME ZONE 'America/Sao_Paulo' AND finish > (d+starts_time) AT TIME ZONE 'America/Sao_Paulo')))
 OR EXISTS(SELECT 1 FROM public.get_busy_slots(a.barber_id,d) b WHERE b.starts_at<finish AND b.ends_at>_starts_at AND NOT(b.starts_at=a.starts_at AND b.ends_at=a.ends_at)) THEN RAISE EXCEPTION 'Horário indisponível. Escolha outro horário.'; END IF;
 END IF;
 IF a.client_plan_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.client_plans WHERE id=a.client_plan_id AND expires_on IS NOT NULL AND expires_on<d) THEN RAISE EXCEPTION 'Plano não válido para esta data.'; END IF;
 END IF;
 PERFORM set_config('app.editing_appointment',a.id::text,true);
 UPDATE public.appointments SET customer_first_name=trim(_first),customer_last_name=trim(coalesce(_last,'')),starts_at=_starts_at,ends_at=finish WHERE id=a.id;
 PERFORM set_config('app.editing_appointment','',true);
END $$;
REVOKE ALL ON FUNCTION public.edit_appointment(uuid,text,text,timestamptz) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.edit_appointment(uuid,text,text,timestamptz) TO authenticated;
DO $$ DECLARE def text; BEGIN SELECT pg_get_functiondef('public.guard_barber_appointment_update()'::regprocedure) INTO def;
 def:=replace(def,'  IF NEW.barber_id IS DISTINCT FROM OLD.barber_id',E'  IF current_setting(''app.editing_appointment'',true)=OLD.id::text AND public.can_edit_appointment(OLD.barber_id) AND OLD.status=''agendado''\n AND (to_jsonb(NEW)-ARRAY[''customer_first_name'',''customer_last_name'',''starts_at'',''ends_at''])=(to_jsonb(OLD)-ARRAY[''customer_first_name'',''customer_last_name'',''starts_at'',''ends_at'']) THEN RETURN NEW; END IF;\n  IF NEW.barber_id IS DISTINCT FROM OLD.barber_id'); EXECUTE def; END $$;