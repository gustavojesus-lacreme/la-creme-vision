DROP POLICY IF EXISTS appointments_insert_guest ON public.appointments;
REVOKE INSERT ON public.appointments FROM anon;