ALTER TABLE public.service_combos ADD COLUMN IF NOT EXISTS item_prices jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.validate_absence() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR NEW.kind IS DISTINCT FROM OLD.kind)
     AND NEW.kind NOT IN ('ausente','ferias','atestado','emergencia') THEN
    RAISE EXCEPTION 'Motivo de ausência inválido.' USING ERRCODE='P0001'; END IF;
  IF NEW.kind = 'ferias' AND (TG_OP = 'INSERT' OR OLD.kind IS DISTINCT FROM 'ferias')
     AND NOT has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Somente a administração pode registrar férias.' USING ERRCODE='42501'; END IF;
  IF (TG_OP = 'INSERT' OR NEW.kind IS DISTINCT FROM OLD.kind)
     AND NEW.kind NOT IN ('atestado','emergencia') AND NOT has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Barbeiro pode registrar apenas Emergência ou Afastamento médico.' USING ERRCODE='42501'; END IF;
  IF NEW.ends_on < NEW.starts_on THEN RAISE EXCEPTION 'Data final anterior à inicial.' USING ERRCODE='P0001'; END IF;
  IF (NEW.starts_time IS NULL) <> (NEW.ends_time IS NULL) THEN RAISE EXCEPTION 'Informe horário inicial e final.' USING ERRCODE='P0001'; END IF;
  IF NEW.starts_time IS NOT NULL AND NEW.ends_time <= NEW.starts_time THEN RAISE EXCEPTION 'Horário final deve ser depois do inicial.' USING ERRCODE='P0001'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(NEW.barber_id::text));
  IF EXISTS (SELECT 1 FROM public.barber_absences x WHERE x.barber_id = NEW.barber_id AND x.id <> NEW.id
      AND x.starts_on <= NEW.ends_on AND x.ends_on >= NEW.starts_on
      AND (x.starts_time IS NULL OR NEW.starts_time IS NULL OR (x.starts_time < NEW.ends_time AND x.ends_time > NEW.starts_time))) THEN
    RAISE EXCEPTION 'Já existe uma ausência que se sobrepõe a este período. Edite a ausência existente.' USING ERRCODE='P0001';
  END IF;
  IF TG_OP = 'INSERT' THEN NEW.created_by := auth.uid();
  ELSE NEW.created_by := OLD.created_by; NEW.updated_by := auth.uid(); END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;