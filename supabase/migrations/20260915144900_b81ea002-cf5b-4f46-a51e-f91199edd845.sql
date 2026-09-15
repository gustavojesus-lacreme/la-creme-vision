CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_cents integer NOT NULL,
  duration_minutes integer NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.services TO anon, authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "services_public_read" ON public.services FOR SELECT TO anon, authenticated USING (active);

CREATE TABLE public.barbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  specialty text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.barbers TO anon, authenticated;
GRANT ALL ON public.barbers TO service_role;
ALTER TABLE public.barbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "barbers_public_read" ON public.barbers FOR SELECT TO anon, authenticated USING (active);

CREATE TABLE public.business_hours (
  weekday smallint PRIMARY KEY,
  opens_at time,
  closes_at time,
  closed boolean NOT NULL DEFAULT false
);
GRANT SELECT ON public.business_hours TO anon, authenticated;
GRANT ALL ON public.business_hours TO service_role;
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "business_hours_public_read" ON public.business_hours FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  whatsapp text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  service_id uuid NOT NULL REFERENCES public.services(id),
  barber_id uuid NOT NULL REFERENCES public.barbers(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  customer_first_name text NOT NULL,
  customer_last_name text NOT NULL,
  customer_whatsapp text NOT NULL,
  status text NOT NULL DEFAULT 'confirmado',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX appointments_barber_start_idx ON public.appointments (barber_id, starts_at);
GRANT SELECT, INSERT, UPDATE ON public.appointments TO authenticated;
GRANT INSERT ON public.appointments TO anon;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "appointments_select_own" ON public.appointments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "appointments_insert_auth" ON public.appointments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "appointments_insert_guest" ON public.appointments FOR INSERT TO anon WITH CHECK (user_id IS NULL AND length(customer_first_name) > 0 AND length(customer_whatsapp) > 0);
CREATE POLICY "appointments_update_own" ON public.appointments FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.get_busy_slots(_barber_id uuid, _day date)
RETURNS TABLE (starts_at timestamptz, ends_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.starts_at, a.ends_at
  FROM public.appointments a
  WHERE a.barber_id = _barber_id
    AND a.status <> 'cancelado'
    AND a.starts_at >= (_day::timestamp AT TIME ZONE 'America/Sao_Paulo')
    AND a.starts_at < ((_day + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo');
$$;
GRANT EXECUTE ON FUNCTION public.get_busy_slots(uuid, date) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, whatsapp)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'whatsapp', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.services (name, description, price_cents, duration_minutes, sort_order) VALUES
  ('Corte de cabelo', 'Corte completo com acabamento.', 5000, 45, 1),
  ('Barba desenhada', 'Barba alinhada e finalizada.', 4000, 30, 2),
  ('Corte + Barba', 'Corte completo e barba desenhada.', 8000, 75, 3),
  ('Luzes', 'Iluminação e coloração personalizada.', 12000, 90, 4);

INSERT INTO public.barbers (name, specialty, sort_order) VALUES
  ('Gustavo Jesus', 'Cortes, barba e luzes', 1);

INSERT INTO public.business_hours (weekday, opens_at, closes_at, closed) VALUES
  (0, NULL, NULL, true),
  (1, NULL, NULL, true),
  (2, '09:00', '19:00', false),
  (3, '09:00', '19:00', false),
  (4, '09:00', '19:00', false),
  (5, '09:00', '19:00', false),
  (6, '08:00', '17:00', false);