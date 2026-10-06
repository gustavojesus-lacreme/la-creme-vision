GRANT SELECT (photo_url, lunch_start) ON public.barbers TO anon, authenticated;
GRANT UPDATE (name, last_name, whatsapp, email, photo_url, lunch_start) ON public.barbers TO authenticated;
GRANT SELECT ON public.notification_settings TO authenticated;