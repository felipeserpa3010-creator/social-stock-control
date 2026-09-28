-- Permissões operacionais:
-- Administrador: entrada, saída e conferência.
-- Responsável: somente saída na própria unidade.
-- Visualizador: somente leitura.

CREATE OR REPLACE FUNCTION public.can_write_unit(_unit_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin()
    AND _unit_id IS NOT NULL
    AND public.can_access_unit(_unit_id);
$$;

DROP POLICY IF EXISTS stock_insert ON public.stock;
CREATE POLICY stock_insert ON public.stock FOR INSERT TO authenticated
  WITH CHECK (public.can_write_unit(unit_id));

DROP POLICY IF EXISTS stock_update ON public.stock;
CREATE POLICY stock_update ON public.stock FOR UPDATE TO authenticated
  USING (public.can_write_unit(unit_id))
  WITH CHECK (public.can_write_unit(unit_id));

DROP POLICY IF EXISTS mov_insert ON public.stock_movements;
CREATE POLICY mov_insert ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.can_access_unit(unit_id)
    AND (
      public.is_admin()
      OR (
        public.has_role(auth.uid(), 'responsavel')
        AND tipo = 'saida'
        AND unit_id = public.my_unit()
      )
    )
  );

DROP POLICY IF EXISTS checks_insert ON public.stock_checks;
CREATE POLICY checks_insert ON public.stock_checks FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() AND public.can_access_unit(unit_id) AND user_id = auth.uid());

DROP POLICY IF EXISTS check_items_insert ON public.stock_check_items;
CREATE POLICY check_items_insert ON public.stock_check_items FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    AND EXISTS (
      SELECT 1
      FROM public.stock_checks c
      WHERE c.id = stock_check_id
        AND public.can_access_unit(c.unit_id)
        AND c.user_id = auth.uid()
    )
  );
