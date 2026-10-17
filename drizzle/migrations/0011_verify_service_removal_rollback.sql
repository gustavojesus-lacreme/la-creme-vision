DO $$ DECLARE a public.appointments%ROWTYPE; r public.appointments%ROWTYPE; uid uuid; pigment uuid; big uuid; brow uuid; denied boolean;
BEGIN
 SELECT * INTO a FROM public.appointments WHERE id='635a1ece-27fb-433a-98e3-5d232b20a1cf';
 SELECT user_id INTO uid FROM public.barbers WHERE id=a.barber_id;
 SELECT id INTO pigment FROM public.services WHERE lower(trim(name))='pigmentação'; SELECT id INTO big FROM public.services WHERE lower(trim(name))='bigode'; SELECT id INTO brow FROM public.services WHERE lower(trim(name))='sobrancelha';
 BEGIN
 PERFORM set_config('request.jwt.claim.sub',uid::text,true); PERFORM set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
 PERFORM public.remove_appointment_service(a.id,pigment); SELECT * INTO r FROM public.appointments WHERE id=a.id;
 IF r.total_price_cents<>4500 OR pigment=ANY(r.service_ids) OR r.total_duration_minutes<>55 THEN RAISE EXCEPTION 'Corte + Sobrancelha + Bigode deve permanecer R$45 e 55min conforme cadastro.'; END IF;
 PERFORM public.remove_appointment_service(a.id,big); SELECT * INTO r FROM public.appointments WHERE id=a.id;
 IF r.total_price_cents<>4000 THEN RAISE EXCEPTION 'Corte + Sobrancelha deve custar R$40.'; END IF;
 PERFORM public.remove_appointment_service(a.id,brow); SELECT * INTO r FROM public.appointments WHERE id=a.id;
 denied:=false; BEGIN PERFORM public.remove_appointment_service(a.id,r.service_id); EXCEPTION WHEN OTHERS THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Último serviço não pode ser removido.'; END IF;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true); PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
 denied:=false; BEGIN PERFORM public.remove_appointment_service(a.id,r.service_id); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Acesso não autorizado não foi bloqueado.'; END IF;
 RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Verificação concluída com rollback';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL; END;
 SELECT * INTO r FROM public.appointments WHERE id=a.id;
 IF to_jsonb(r) IS DISTINCT FROM to_jsonb(a) THEN RAISE EXCEPTION 'Atendimento não foi preservado.'; END IF;
END $$;