CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND ativo = true);
$$;
REVOKE EXECUTE ON FUNCTION public.is_active_user() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_active_user() TO authenticated;

DROP POLICY IF EXISTS settings_select ON public.settings;
CREATE POLICY settings_select ON public.settings FOR SELECT TO authenticated USING (public.is_active_user());
DROP POLICY IF EXISTS cat_select ON public.categories;
CREATE POLICY cat_select ON public.categories FOR SELECT TO authenticated USING (public.is_active_user());
DROP POLICY IF EXISTS prod_select ON public.products;
CREATE POLICY prod_select ON public.products FOR SELECT TO authenticated USING (public.is_active_user());