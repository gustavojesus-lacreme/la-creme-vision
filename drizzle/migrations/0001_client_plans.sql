CREATE TABLE public.client_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.plans(id),
  label text NOT NULL DEFAULT 'Plano mensal',
  total_uses integer NOT NULL DEFAULT 4 CHECK (total_uses > 0),
  used_uses integer NOT NULL DEFAULT 0 CHECK (used_uses >= 0),
  paid_at timestamptz NOT NULL DEFAULT now(),
  expires_on date,
  active boolean NOT NULL DEFAULT true,
  note text NOT NULL DEFAULT '',
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_plans TO authenticated;
GRANT ALL ON public.client_plans TO service_role;
ALTER TABLE public.client_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read client plans" ON public.client_plans FOR SELECT TO authenticated USING (public.is_staff_booker());
CREATE POLICY "Client reads own plans" ON public.client_plans FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.profile_id = auth.uid()));
CREATE POLICY "Admin insert client plans" ON public.client_plans FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin update client plans" ON public.client_plans FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin delete client plans" ON public.client_plans FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

ALTER TABLE public.appointments ADD COLUMN client_plan_id uuid REFERENCES public.client_plans(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.apply_client_plan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE cid uuid; cp record; covered uuid[]; disc int;
BEGIN
  NEW.client_plan_id := NULL;
  cid := NEW.client_id;
  IF cid IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT id INTO cid FROM public.clients WHERE profile_id = NEW.user_id;
  END IF;
  IF cid IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO cp FROM public.client_plans
   WHERE client_id = cid AND active AND used_uses < total_uses
     AND (expires_on IS NULL OR expires_on >= (NEW.starts_at AT TIME ZONE 'America/Sao_Paulo')::date)
   ORDER BY paid_at LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF cp.plan_id IS NOT NULL THEN
    SELECT array_agg(service_id) INTO covered FROM public.plan_items WHERE plan_id = cp.plan_id;
  END IF;
  IF covered IS NULL THEN
    SELECT array_agg(id) INTO covered FROM public.services WHERE lower(trim(name)) = 'corte';
  END IF;
  SELECT COALESCE(sum(price_cents),0) INTO disc FROM public.services WHERE id = ANY(NEW.service_ids) AND id = ANY(covered);
  IF disc <= 0 THEN RETURN NEW; END IF;
  NEW.total_price_cents := GREATEST(0, COALESCE(NEW.total_price_cents,0) - disc);
  NEW.client_plan_id := cp.id;
  UPDATE public.client_plans SET used_uses = used_uses + 1 WHERE id = cp.id;
  RETURN NEW;
END $$;
CREATE TRIGGER appointments_ab_plan BEFORE INSERT ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.apply_client_plan();

CREATE OR REPLACE FUNCTION public.release_client_plan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.client_plan_id IS NOT NULL AND NEW.status IN ('cancelado','nao_compareceu')
     AND OLD.status IS DISTINCT FROM NEW.status AND OLD.status NOT IN ('cancelado','nao_compareceu') THEN
    UPDATE public.client_plans SET used_uses = GREATEST(0, used_uses - 1) WHERE id = NEW.client_plan_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER appointments_release_plan AFTER UPDATE OF status ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.release_client_plan();