DO $$ DECLARE a public.appointments%ROWTYPE; r public.appointments%ROWTYPE; uid uuid; denied boolean;
BEGIN SELECT * INTO a FROM public.appointments WHERE id='07fa76d2-8b6e-401d-ac33-e08ba3815498'; SELECT user_id INTO uid FROM public.barbers WHERE id=a.barber_id;
 BEGIN
 PERFORM set_config('request.jwt.claim.sub',uid::text,true); PERFORM set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
 IF NOT public.can_edit_appointment(a.barber_id) THEN RAISE EXCEPTION 'Dono deve poder editar.'; END IF;
 PERFORM public.edit_appointment(a.id,a.customer_first_name,a.customer_last_name,a.starts_at+interval '10 minutes');
 SELECT * INTO r FROM public.appointments WHERE id=a.id;
 IF r.starts_at<>a.starts_at+interval '10 minutes' OR r.ends_at-r.starts_at<>a.ends_at-a.starts_at THEN RAISE EXCEPTION 'Edição não manteve duração.'; END IF;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true); PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
 IF public.can_edit_appointment(a.barber_id) THEN RAISE EXCEPTION 'Cliente não deve ter permissão.'; END IF;
 denied:=false; BEGIN PERFORM public.edit_appointment(a.id,'Outro','',a.starts_at); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Edição não autorizada não foi bloqueada.'; END IF;
 RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Rollback de teste'; EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL; END;
 SELECT * INTO r FROM public.appointments WHERE id=a.id; IF to_jsonb(a) IS DISTINCT FROM to_jsonb(r) THEN RAISE EXCEPTION 'Dados não preservados.'; END IF;
END $$;