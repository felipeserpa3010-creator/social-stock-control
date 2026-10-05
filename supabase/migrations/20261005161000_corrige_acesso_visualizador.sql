-- Correção: visualizador não recebe acesso implícito ao Gabinete SEMADS.
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
      OR (
        NOT public.is_viewer()
        AND _unit_id IS NOT NULL
        AND _unit_id = public.my_unit()
      );
$$;

REVOKE EXECUTE ON FUNCTION public.can_access_unit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_unit(uuid) TO authenticated, service_role;
