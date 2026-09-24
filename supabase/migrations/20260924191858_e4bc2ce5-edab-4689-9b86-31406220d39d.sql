ALTER TABLE public.appointments
  ADD COLUMN service_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN services_label text NOT NULL DEFAULT '',
  ADD COLUMN total_price_cents integer,
  ADD COLUMN total_duration_minutes integer;

CREATE TABLE public.service_combos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  service_ids uuid[] NOT NULL,
  price_cents integer NOT NULL,
  duration_minutes integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.service_combos TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.service_combos TO authenticated;
GRANT ALL ON public.service_combos TO service_role;
ALTER TABLE public.service_combos ENABLE ROW LEVEL SECURITY;
CREATE POLICY combos_public_read ON public.service_combos FOR SELECT TO anon, authenticated USING (active OR public.has_role(auth.uid(),'admin'));
CREATE POLICY combos_admin_write ON public.service_combos FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

GRANT INSERT, UPDATE ON public.services TO authenticated;
CREATE POLICY services_admin_read ON public.services FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY services_admin_write ON public.services FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY services_admin_insert ON public.services FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER service_combos_updated_at BEFORE UPDATE ON public.service_combos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.service_combos (name, service_ids, price_cents, duration_minutes)
SELECT v.name, ARRAY(SELECT s.id FROM public.services s WHERE s.name = ANY(v.parts)), v.price, v.dur
FROM (VALUES
  ('Corte + Barba', ARRAY['Corte','Barba'], 6500, 50),
  ('Corte + Sobrancelha', ARRAY['Corte','Sobrancelha'], 4000, 40),
  ('Corte + Bigode', ARRAY['Corte','Bigode'], 4000, 40),
  ('Corte + Pezinho', ARRAY['Corte','Pezinho'], 3500, 35)
) AS v(name, parts, price, dur);