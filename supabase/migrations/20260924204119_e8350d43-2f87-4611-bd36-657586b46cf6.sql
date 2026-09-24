ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'barbeiro';

ALTER TABLE public.barbers ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS barbers_user_id_key ON public.barbers(user_id) WHERE user_id IS NOT NULL;

CREATE POLICY "Barbers can view own appointments"
ON public.appointments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.barbers b
    WHERE b.id = appointments.barber_id
      AND b.user_id = auth.uid()
  )
);

CREATE POLICY "Barbers can update own appointments"
ON public.appointments
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.barbers b
    WHERE b.id = appointments.barber_id
      AND b.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.barbers b
    WHERE b.id = appointments.barber_id
      AND b.user_id = auth.uid()
  )
);