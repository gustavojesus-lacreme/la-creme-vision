REVOKE EXECUTE ON FUNCTION public.barber_commissionable(uuid) FROM authenticated;
ALTER FUNCTION public.compute_financial_entry() SECURITY DEFINER;
REVOKE EXECUTE ON FUNCTION public.compute_financial_entry() FROM PUBLIC, anon, authenticated;