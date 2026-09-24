ALTER TABLE public.barbers ADD COLUMN IF NOT EXISTS service_ids uuid[] NOT NULL DEFAULT '{}';

CREATE POLICY barbers_admin_read ON public.barbers FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY barbers_admin_insert ON public.barbers FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY barbers_admin_update ON public.barbers FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
GRANT SELECT, INSERT, UPDATE ON public.barbers TO authenticated;

CREATE TABLE public.barber_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id uuid NOT NULL REFERENCES public.barbers(id) ON DELETE CASCADE,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.barber_invites TO authenticated;
GRANT ALL ON public.barber_invites TO service_role;
ALTER TABLE public.barber_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY invites_admin_all ON public.barber_invites FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));