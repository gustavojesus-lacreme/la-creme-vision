DROP POLICY IF EXISTS combos_public_read ON public.service_combos;
CREATE POLICY combos_public_read ON public.service_combos FOR SELECT TO anon, authenticated USING (active);
CREATE POLICY combos_admin_read ON public.service_combos FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));