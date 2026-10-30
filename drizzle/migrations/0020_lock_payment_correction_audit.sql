REVOKE ALL ON public.financial_payment_corrections FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.financial_payment_corrections FROM authenticated;
GRANT SELECT ON public.financial_payment_corrections TO authenticated;
REVOKE ALL ON public.financial_correction_permissions FROM anon;