-- Separa permissão de leitura da permissão de lançamento.
CREATE OR REPLACE FUNCTION public.can_write_unit(_unit_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin()
    OR (
      public.has_role(auth.uid(), 'responsavel')
      AND _unit_id IS NOT NULL
      AND _unit_id = public.my_unit()
    );
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
  WITH CHECK (public.can_write_unit(unit_id) AND user_id = auth.uid());

DROP POLICY IF EXISTS checks_insert ON public.stock_checks;
CREATE POLICY checks_insert ON public.stock_checks FOR INSERT TO authenticated
  WITH CHECK (public.can_write_unit(unit_id) AND user_id = auth.uid());

DROP POLICY IF EXISTS check_items_insert ON public.stock_check_items;
CREATE POLICY check_items_insert ON public.stock_check_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.stock_checks c
      WHERE c.id = stock_check_id
        AND public.can_write_unit(c.unit_id)
        AND c.user_id = auth.uid()
    )
  );
