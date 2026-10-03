-- Permite ao CEO excluir um lançamento e desfaz automaticamente seu efeito no estoque.
-- Usuários comuns continuam sem permissão de exclusão.

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
  -- Movimentos de entrada aumentaram o estoque: ao excluir, subtrai.
  -- Movimentos de saída reduziram o estoque: ao excluir, devolve.
  SELECT quantidade INTO atual
  FROM public.stock
  WHERE unit_id = OLD.unit_id AND product_id = OLD.product_id
  FOR UPDATE;

  IF atual IS NULL THEN
    RETURN OLD;
  END IF;

  IF OLD.tipo = 'entrada' THEN
    nova := atual - OLD.quantidade;
  ELSIF OLD.tipo = 'saida' THEN
    nova := atual + OLD.quantidade;
  ELSE
    RETURN OLD;
  END IF;

  IF nova < 0 THEN
    RAISE EXCEPTION 'Não é possível excluir este lançamento porque o estoque atual é menor que a quantidade que será revertida.';
  END IF;

  UPDATE public.stock
  SET quantidade = nova, updated_at = now()
  WHERE unit_id = OLD.unit_id AND product_id = OLD.product_id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_reverse_movement ON public.stock_movements;
CREATE TRIGGER trg_reverse_movement
BEFORE DELETE ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.reverse_movement();

REVOKE EXECUTE ON FUNCTION public.reverse_movement() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_movement() TO service_role;

DROP POLICY IF EXISTS mov_delete ON public.stock_movements;
CREATE POLICY mov_delete ON public.stock_movements
FOR DELETE TO authenticated
USING (public.is_admin());
