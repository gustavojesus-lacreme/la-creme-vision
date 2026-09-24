ALTER TABLE public.barbers
  ADD COLUMN IF NOT EXISTS last_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS whatsapp text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email text;

-- Public clients see only safe columns: restrict public read to non-sensitive columns via column grants
REVOKE SELECT ON public.barbers FROM anon;
GRANT SELECT (id, name, last_name, specialty, sort_order, active, service_ids, created_at) ON public.barbers TO anon;

-- Every new account gets the CLIENTE role ('user'); roles can't be chosen at signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, whatsapp)
  VALUES (NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'whatsapp', ''))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- Backfill: existing accounts without any role become clients
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'user'::app_role FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id)
ON CONFLICT DO NOTHING;