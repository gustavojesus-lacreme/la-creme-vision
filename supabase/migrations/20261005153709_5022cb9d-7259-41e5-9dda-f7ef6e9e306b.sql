DROP POLICY IF EXISTS combos_admin_write ON public.service_combos;
CREATE POLICY combos_admin_insert ON public.service_combos FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY combos_admin_update ON public.service_combos FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY combos_admin_delete ON public.service_combos FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));