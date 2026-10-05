-- Acesso do Gabinete SEMADS por unidades selecionadas pelo CEO.
CREATE TABLE IF NOT EXISTS public.viewer_unit_access (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, unit_id)
);

ALTER TABLE public.viewer_unit_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS viewer_unit_access_select ON public.viewer_unit_access;
CREATE POLICY viewer_unit_access_select ON public.viewer_unit_access
FOR SELECT TO authenticated
USING (public.is_admin() OR user_id = auth.uid());

DROP POLICY IF EXISTS viewer_unit_access_insert ON public.viewer_unit_access;
CREATE POLICY viewer_unit_access_insert ON public.viewer_unit_access
FOR INSERT TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS viewer_unit_access_delete ON public.viewer_unit_access;
CREATE POLICY viewer_unit_access_delete ON public.viewer_unit_access
FOR DELETE TO authenticated
USING (public.is_admin());

GRANT SELECT ON public.viewer_unit_access TO authenticated;
GRANT INSERT, DELETE ON public.viewer_unit_access TO authenticated;

-- Visualizadores só acessam as unidades autorizadas pelo CEO.
CREATE OR REPLACE FUNCTION public.can_access_unit(_unit_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_admin()
      OR (
        public.is_viewer()
        AND EXISTS (
          SELECT 1
          FROM public.viewer_unit_access v
          WHERE v.user_id = auth.uid()
            AND v.unit_id = _unit_id
        )
      )
      OR (_unit_id IS NOT NULL AND _unit_id = public.my_unit());
$$;

DROP POLICY IF EXISTS units_select ON public.units;
CREATE POLICY units_select ON public.units
FOR SELECT TO authenticated
USING (public.can_access_unit(id));

DROP POLICY IF EXISTS stock_select ON public.stock;
CREATE POLICY stock_select ON public.stock
FOR SELECT TO authenticated
USING (public.can_access_unit(unit_id));

DROP POLICY IF EXISTS mov_select ON public.stock_movements;
CREATE POLICY mov_select ON public.stock_movements
FOR SELECT TO authenticated
USING (public.can_access_unit(unit_id));

REVOKE EXECUTE ON FUNCTION public.can_access_unit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_unit(uuid) TO authenticated, service_role;

-- Garante que o visualizador não seja aceito em nenhuma operação de escrita.
CREATE OR REPLACE FUNCTION public.can_write_unit(_unit_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_admin()
      OR (
        public.is_active_user()
        AND NOT public.is_viewer()
        AND _unit_id IS NOT NULL
        AND _unit_id = public.my_unit()
      );
$$;

REVOKE EXECUTE ON FUNCTION public.can_write_unit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_unit(uuid) TO authenticated, service_role;
