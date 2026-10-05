-- Permite ao CEO excluir lançamentos e reverter automaticamente o saldo do estoque.
-- Usuários comuns continuam sem permissão de exclusão.
GRANT DELETE ON public.stock_movements TO authenticated;

DROP POLICY IF EXISTS mov_delete ON public.stock_movements;
CREATE POLICY mov_delete ON public.stock_movements
FOR DELETE TO authenticated
USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.reverse_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  atual numeric;
  nova numeric;
BEGIN
  -- O fluxo atual permite exclusão de entradas e saídas.
  IF OLD.tipo NOT IN ('entrada', 'saida') THEN
    RAISE EXCEPTION 'Somente entradas e saídas podem ser excluídas.';
  END IF;

  SELECT quantidade INTO atual
  FROM public.stock
  WHERE unit_id = OLD.unit_id
    AND product_id = OLD.product_id
  FOR UPDATE;

  IF atual IS NULL THEN
    RAISE EXCEPTION 'Saldo do produto não encontrado para reverter o lançamento.';
  END IF;

  IF OLD.tipo = 'entrada' THEN
    nova := atual - OLD.quantidade;
  ELSE
    nova := atual + OLD.quantidade;
  END IF;

  IF nova < 0 THEN
    RAISE EXCEPTION 'Não é possível excluir esta entrada porque o saldo atual já utiliza essa quantidade.';
  END IF;

  UPDATE public.stock
  SET quantidade = nova,
      updated_at = now()
  WHERE unit_id = OLD.unit_id
    AND product_id = OLD.product_id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_reverse_movement ON public.stock_movements;
CREATE TRIGGER trg_reverse_movement
AFTER DELETE ON public.stock_movements
FOR EACH ROW
EXECUTE FUNCTION public.reverse_movement();

REVOKE EXECUTE ON FUNCTION public.reverse_movement() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_movement() TO service_role;
