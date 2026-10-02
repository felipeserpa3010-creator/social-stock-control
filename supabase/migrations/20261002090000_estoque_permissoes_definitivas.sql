-- Controle de acesso definitivo para estoque por unidade
-- O índice parcial garante no banco que exista no máximo um CEO/Admin.
CREATE UNIQUE INDEX IF NOT EXISTS one_admin_only ON public.user_roles (role) WHERE role = 'admin';
-- CEO/Admin: entradas e administração global.
-- Responsável de unidade: somente saídas da própria unidade.
-- Gabinete/Visualizador: somente leitura e relatórios de todas as unidades.

CREATE OR REPLACE FUNCTION public.is_viewer()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'visualizador'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_unit(_unit_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_admin()
      OR public.is_viewer()
      OR (_unit_id IS NOT NULL AND _unit_id = public.my_unit());
$$;

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

REVOKE EXECUTE ON FUNCTION public.is_viewer() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_unit(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_write_unit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_viewer() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_unit(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_write_unit(uuid) TO authenticated, service_role;

-- Usuário comum não pode editar o saldo diretamente.
DROP POLICY IF EXISTS stock_insert ON public.stock;
DROP POLICY IF EXISTS stock_update ON public.stock;
DROP POLICY IF EXISTS stock_delete ON public.stock;
REVOKE INSERT, UPDATE, DELETE ON public.stock FROM authenticated;

-- O saldo é alterado somente pelo trigger de movimentação/conferência.
-- Mantemos SELECT por unidade, incluindo todas as unidades para CEO/Gabinete.
DROP POLICY IF EXISTS stock_select ON public.stock;
CREATE POLICY stock_select ON public.stock
FOR SELECT TO authenticated
USING (public.can_access_unit(unit_id));

-- O Gabinete precisa enxergar todas as unidades para relatórios.
DROP POLICY IF EXISTS units_select ON public.units;
CREATE POLICY units_select ON public.units
FOR SELECT TO authenticated
USING (public.is_admin() OR public.is_viewer() OR id = public.my_unit());

-- Nenhum usuário comum pode criar entrada, conferência ou ajuste.
-- CEO pode lançar entradas; responsável pode lançar somente saídas da própria unidade.
DROP POLICY IF EXISTS mov_insert ON public.stock_movements;
CREATE POLICY mov_insert ON public.stock_movements
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    (tipo = 'entrada' AND public.is_admin())
    OR
    (tipo = 'saida'
      AND public.is_active_user()
      AND NOT public.is_viewer()
      AND unit_id = public.my_unit()
    )
  )
);

-- Visualização de movimentações segue o mesmo isolamento por unidade.
DROP POLICY IF EXISTS mov_select ON public.stock_movements;
CREATE POLICY mov_select ON public.stock_movements
FOR SELECT TO authenticated
USING (public.can_access_unit(unit_id));

-- Conferência não é uma forma de movimentação disponível aos usuários.
DROP POLICY IF EXISTS checks_insert ON public.stock_checks;
CREATE POLICY checks_insert ON public.stock_checks
FOR INSERT TO authenticated
WITH CHECK (public.is_admin() AND user_id = auth.uid());

DROP POLICY IF EXISTS check_items_insert ON public.stock_check_items;
CREATE POLICY check_items_insert ON public.stock_check_items
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin()
  AND EXISTS (
    SELECT 1 FROM public.stock_checks c
    WHERE c.id = stock_check_id
      AND c.unit_id IS NOT NULL
      AND c.user_id = auth.uid()
  )
);

-- Garantia adicional: o trigger de estoque também rejeita tipos de movimento
-- que não fazem parte do fluxo operacional atual.
CREATE OR REPLACE FUNCTION public.apply_movement()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  atual numeric;
  nova numeric;
  unit_ativa boolean;
BEGIN
  SELECT ativo INTO unit_ativa FROM public.units WHERE id = NEW.unit_id;
  IF unit_ativa IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Unidade desativada: não é possível registrar movimentações.';
  END IF;

  IF NEW.tipo NOT IN ('entrada', 'saida') THEN
    RAISE EXCEPTION 'Tipo de movimentação não permitido pelo fluxo atual.';
  END IF;

  IF NEW.quantidade <= 0 THEN
    RAISE EXCEPTION 'A quantidade deve ser maior que zero.';
  END IF;

  INSERT INTO public.stock (unit_id, product_id, quantidade)
  VALUES (NEW.unit_id, NEW.product_id, 0)
  ON CONFLICT (unit_id, product_id) DO NOTHING;

  SELECT quantidade INTO atual
  FROM public.stock
  WHERE unit_id = NEW.unit_id AND product_id = NEW.product_id
  FOR UPDATE;

  IF NEW.tipo = 'entrada' THEN
    nova := atual + NEW.quantidade;
  ELSE
    nova := atual - NEW.quantidade;
  END IF;

  IF nova < 0 THEN
    RAISE EXCEPTION 'Estoque insuficiente. Disponível: %', atual;
  END IF;

  UPDATE public.stock
  SET quantidade = nova, updated_at = now()
  WHERE unit_id = NEW.unit_id AND product_id = NEW.product_id;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_movement() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_movement() TO service_role;

-- Evita que uma conta comum transforme-se em administrador por alteração de papel.
-- A existência de exatamente um administrador continua sendo controlada pela aplicação
-- no primeiro cadastro e por estas políticas nas operações normais.
