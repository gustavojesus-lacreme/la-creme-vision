ALTER TABLE public.barbers ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS archived_at timestamptz;
GRANT SELECT (archived_at) ON public.barbers TO anon;
CREATE POLICY profiles_admin_read ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS appointments_insert_auth ON public.appointments;
CREATE POLICY appointments_insert_auth ON public.appointments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.archived_at IS NOT NULL));