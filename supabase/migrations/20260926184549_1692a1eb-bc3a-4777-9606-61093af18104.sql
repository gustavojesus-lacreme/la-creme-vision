ALTER TABLE public.barbers ADD COLUMN IF NOT EXISTS approved_at timestamptz;
UPDATE public.barbers SET approved_at = now() WHERE user_id IS NOT NULL AND approved_at IS NULL;
GRANT SELECT (approved_at) ON public.barbers TO anon;

CREATE OR REPLACE FUNCTION public.is_barber_bookable(_barber_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = _barber_id AND b.active AND b.archived_at IS NULL AND b.approved_at IS NOT NULL)
$$;

DROP POLICY IF EXISTS barbers_public_read ON public.barbers;
CREATE POLICY barbers_public_read ON public.barbers FOR SELECT TO anon, authenticated
  USING (active AND archived_at IS NULL AND user_id IS NOT NULL AND approved_at IS NOT NULL);
-- A linked barber can always read their own profile (to see pending status).
CREATE POLICY barbers_self_read ON public.barbers FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Barbers can view own appointments" ON public.appointments;
CREATE POLICY "Barbers can view own appointments" ON public.appointments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = appointments.barber_id AND b.user_id = auth.uid() AND b.approved_at IS NOT NULL AND b.active));
DROP POLICY IF EXISTS "Barbers can update own appointments" ON public.appointments;
CREATE POLICY "Barbers can update own appointments" ON public.appointments FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = appointments.barber_id AND b.user_id = auth.uid() AND b.approved_at IS NOT NULL AND b.active))
  WITH CHECK (EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = appointments.barber_id AND b.user_id = auth.uid() AND b.approved_at IS NOT NULL AND b.active));