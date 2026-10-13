CREATE OR REPLACE FUNCTION public.release_client_plan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.client_plan_id IS NOT NULL AND NEW.status = 'cancelado'
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.client_plans SET used_uses = GREATEST(0, used_uses - 1) WHERE id = NEW.client_plan_id;
  END IF;
  RETURN NEW;
END $$;