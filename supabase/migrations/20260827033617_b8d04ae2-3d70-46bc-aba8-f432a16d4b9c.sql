REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_unit() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_unit(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_movement() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_check_item() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_unit() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_unit(uuid) TO authenticated, service_role;