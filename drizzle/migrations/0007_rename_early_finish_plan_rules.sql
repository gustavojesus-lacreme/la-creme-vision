ALTER TABLE public.operation_settings ADD COLUMN IF NOT EXISTS plan_full_uses integer NOT NULL DEFAULT 4 CHECK (plan_full_uses BETWEEN 1 AND 60);

CREATE OR REPLACE FUNCTION public.rename_appointment(_id uuid, _first text, _last text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF length(trim(coalesce(_first,''))) < 1 THEN RAISE EXCEPTION 'Informe o nome.'; END IF;
  IF NOT (has_role(auth.uid(),'admin') OR EXISTS (
    SELECT 1 FROM appointments a JOIN barbers b ON b.id = a.barber_id WHERE a.id = _id AND b.user_id = auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para alterar este agendamento.' USING ERRCODE='42501';
  END IF;
  ALTER TABLE appointments DISABLE TRIGGER appointments_guard_barber;
  UPDATE appointments SET customer_first_name = trim(_first), customer_last_name = trim(coalesce(_last,'')) WHERE id = _id;
  ALTER TABLE appointments ENABLE TRIGGER appointments_guard_barber;
END $$;
REVOKE ALL ON FUNCTION public.rename_appointment(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_appointment(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.release_early_finish()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'finalizado' AND OLD.status IS DISTINCT FROM 'finalizado' AND now() < NEW.ends_at THEN
    NEW.ends_at := GREATEST(now(), NEW.starts_at + interval '1 minute');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER appointments_zz_release_early BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.release_early_finish();