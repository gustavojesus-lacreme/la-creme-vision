
REVOKE EXECUTE ON FUNCTION public.register_stock_movement(uuid, text, integer, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_sellable_products() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.refund_product_sale(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.finalize_appointment(uuid, text, integer, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.apply_stock_movement() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_stock_movement(uuid, text, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sellable_products() TO authenticated;
GRANT EXECUTE ON FUNCTION public.refund_product_sale(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_appointment(uuid, text, integer, jsonb) TO authenticated;
