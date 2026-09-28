REVOKE EXECUTE ON FUNCTION public.enforce_semads_viewer() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_viewer() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_unit(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_write_unit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_viewer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_unit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_unit(uuid) TO authenticated;