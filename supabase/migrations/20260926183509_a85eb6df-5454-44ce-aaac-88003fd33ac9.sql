CREATE OR REPLACE FUNCTION public.is_barber_bookable(_barber_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = _barber_id AND b.active AND b.archived_at IS NULL AND b.user_id IS NOT NULL)
$$;
DROP POLICY IF EXISTS barbers_public_read ON public.barbers;
CREATE POLICY barbers_public_read ON public.barbers FOR SELECT TO anon, authenticated
  USING (active AND archived_at IS NULL AND user_id IS NOT NULL);
DROP POLICY IF EXISTS appointments_insert_auth ON public.appointments;
CREATE POLICY appointments_insert_auth ON public.appointments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_barber_bookable(barber_id)
    AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.archived_at IS NOT NULL));
DROP POLICY IF EXISTS appointments_insert_guest ON public.appointments;
CREATE POLICY appointments_insert_guest ON public.appointments FOR INSERT TO anon
  WITH CHECK (user_id IS NULL AND length(customer_first_name) > 0 AND length(customer_whatsapp) > 0 AND public.is_barber_bookable(barber_id));