
-- 1) Clients cannot un-archive themselves or change their profile id
CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR has_role(auth.uid(),'admin') THEN RETURN NEW; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Sem permissão para alterar o status da conta.' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS profiles_guard_self ON public.profiles;
CREATE TRIGGER profiles_guard_self BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_self_update();

-- 2) Notifications: users may only mark as read
REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;

-- 3) Deactivated/pending barbers lose access to finance and absence data and self-edits
DROP POLICY IF EXISTS fe_barber_read ON public.financial_entries;
CREATE POLICY fe_barber_read ON public.financial_entries FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.barbers b WHERE b.user_id = auth.uid() AND b.active AND b.approved_at IS NOT NULL
  AND b.id = ANY (ARRAY[financial_entries.barber_id, financial_entries.commission_barber_id, financial_entries.seller_barber_id])));

DROP POLICY IF EXISTS barber_absences_self_select ON public.barber_absences;
CREATE POLICY barber_absences_self_select ON public.barber_absences FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = barber_absences.barber_id AND b.user_id = auth.uid() AND b.active AND b.approved_at IS NOT NULL));

DROP POLICY IF EXISTS barbers_self_update ON public.barbers;
CREATE POLICY barbers_self_update ON public.barbers FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND active AND approved_at IS NOT NULL AND archived_at IS NULL)
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS ns_barber_read ON public.notification_settings;
CREATE POLICY ns_barber_read ON public.notification_settings FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.barbers b WHERE b.user_id = auth.uid() AND b.active AND b.approved_at IS NOT NULL));
