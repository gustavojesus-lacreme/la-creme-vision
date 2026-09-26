CREATE OR REPLACE FUNCTION public.is_barber_bookable(_barber_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = _barber_id AND b.active AND b.archived_at IS NULL)
$$;