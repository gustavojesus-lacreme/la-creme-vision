CREATE TABLE public.staff_permissions (
  barber_id uuid PRIMARY KEY REFERENCES public.barbers(id) ON DELETE CASCADE,
  create_clients boolean NOT NULL DEFAULT false,
  counter_sale boolean NOT NULL DEFAULT false,
  change_barber boolean NOT NULL DEFAULT false,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.staff_permissions TO authenticated;
GRANT ALL ON public.staff_permissions TO service_role;
ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin or self reads permissions" ON public.staff_permissions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR barber_id IN (SELECT id FROM public.barbers WHERE user_id = auth.uid()));

-- Admin always; otherwise explicit row; without row, leaders keep today's defaults (sale, change barber)
CREATE OR REPLACE FUNCTION public.staff_can(_perm text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.barbers; p public.staff_permissions;
BEGIN
  IF public.has_role(auth.uid(),'admin') THEN RETURN true; END IF;
  SELECT * INTO b FROM public.barbers WHERE user_id = auth.uid() AND active AND approved_at IS NOT NULL AND archived_at IS NULL LIMIT 1;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO p FROM public.staff_permissions WHERE barber_id = b.id;
  IF NOT FOUND THEN
    RETURN _perm IN ('counter_sale','change_barber') AND b.team_role IN ('lider','administrador','dono');
  END IF;
  RETURN CASE _perm WHEN 'create_clients' THEN p.create_clients WHEN 'counter_sale' THEN p.counter_sale
    WHEN 'change_barber' THEN p.change_barber ELSE false END;
END $$;
REVOKE EXECUTE ON FUNCTION public.staff_can(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_can(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_staff_permissions(_barber_id uuid, _create_clients boolean, _counter_sale boolean, _change_barber boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501'; END IF;
  INSERT INTO public.staff_permissions(barber_id, create_clients, counter_sale, change_barber, updated_by, updated_at)
  VALUES (_barber_id, _create_clients, _counter_sale, _change_barber, auth.uid(), now())
  ON CONFLICT (barber_id) DO UPDATE SET create_clients=EXCLUDED.create_clients, counter_sale=EXCLUDED.counter_sale,
    change_barber=EXCLUDED.change_barber, updated_by=EXCLUDED.updated_by, updated_at=now();
END $$;
REVOKE EXECUTE ON FUNCTION public.set_staff_permissions(uuid, boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_staff_permissions(uuid, boolean, boolean, boolean) TO authenticated;

DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.create_walkin_client(text,text,text)'::regprocedure);
  d := replace(d, 'IF NOT public.has_role(auth.uid(),''admin'') THEN RAISE EXCEPTION ''Somente o administrador cadastra cliente novo.''',
                  'IF NOT public.staff_can(''create_clients'') THEN RAISE EXCEPTION ''Você não tem liberação para cadastrar cliente novo.''');
  IF position('staff_can' in d) = 0 THEN RAISE EXCEPTION 'create_walkin_client guard not found'; END IF;
  EXECUTE d;
  d := pg_get_functiondef('public.register_counter_sale(jsonb,text,text,uuid,boolean,text)'::regprocedure);
  d := replace(d, 'IF NOT public.is_admin_or_leader() THEN', 'IF NOT public.staff_can(''counter_sale'') THEN');
  IF position('staff_can' in d) = 0 THEN RAISE EXCEPTION 'register_counter_sale guard not found'; END IF;
  EXECUTE d;
  d := pg_get_functiondef('public.staff_create_appointment(uuid,uuid,timestamptz,uuid[],text,integer,integer,boolean)'::regprocedure);
  d := replace(d, 'IF NOT public.is_admin_or_leader() AND (own IS NULL', 'IF NOT public.staff_can(''change_barber'') AND (own IS NULL');
  IF position('staff_can' in d) = 0 THEN RAISE EXCEPTION 'staff_create_appointment guard not found'; END IF;
  EXECUTE d;
END $do$;