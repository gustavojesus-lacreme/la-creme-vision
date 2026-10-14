ALTER TABLE public.operation_settings ADD COLUMN IF NOT EXISTS guest_booking_enabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.guest_booking_enabled()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT guest_booking_enabled FROM public.operation_settings WHERE id = 1), false)
$$;
GRANT EXECUTE ON FUNCTION public.guest_booking_enabled() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.valid_br_whatsapp(_w text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE d text := regexp_replace(coalesce(_w,''), '\D', '', 'g'); n text;
BEGIN
  IF length(d) = 13 AND left(d,2) = '55' THEN d := substr(d,3); END IF;
  IF length(d) <> 11 THEN RETURN false; END IF;
  IF substr(d,1,1) = '0' OR substr(d,2,1) = '0' THEN RETURN false; END IF;
  IF substr(d,3,1) <> '9' THEN RETURN false; END IF;
  n := substr(d,4);
  IF n ~ '^(\d)\1+$' THEN RETURN false; END IF;
  IF n ~ '(\d)\1{4,}' THEN RETURN false; END IF;
  IF n IN ('12345678','87654321') THEN RETURN false; END IF;
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.valid_br_whatsapp(text) TO anon, authenticated;

GRANT INSERT ON public.appointments TO anon;
DROP POLICY IF EXISTS appointments_insert_guest ON public.appointments;
CREATE POLICY appointments_insert_guest ON public.appointments FOR INSERT TO anon
WITH CHECK (
  public.guest_booking_enabled()
  AND user_id IS NULL AND created_by IS NULL AND client_id IS NULL AND is_walkin = false
  AND length(trim(customer_first_name)) >= 2
  AND public.valid_br_whatsapp(customer_whatsapp)
);