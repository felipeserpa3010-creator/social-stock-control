-- Corrige a reversão de estoque ao excluir lançamentos pendentes.
-- Entradas PENDENTE_RECEBIMENTO não alteram o estoque até a confirmação.
-- Portanto, excluir uma entrada pendente e ainda não confirmada não pode
-- subtrair quantidade do estoque. Entradas já confirmadas continuam sendo
-- revertidas normalmente quando o CEO as exclui.

CREATE OR REPLACE FUNCTION public.reverse_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  atual numeric;
  nova numeric;
  v_pendente boolean;
  v_confirmado boolean;
BEGIN
  IF OLD.tipo NOT IN ('entrada', 'saida') THEN
    RAISE EXCEPTION 'Somente entradas e saídas podem ser excluídas.';
  END IF;

  v_pendente :=
    OLD.tipo = 'entrada'
    AND COALESCE(OLD.observacao, '') ILIKE '%PENDENTE_RECEBIMENTO%';

  IF v_pendente THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.stock_receipts sr
      WHERE sr.movement_id = OLD.id
    ) INTO v_confirmado;

    -- Entrada pendente ainda não confirmada nunca foi somada ao estoque.
    IF NOT v_confirmado THEN
      RETURN OLD;
    END IF;
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

REVOKE EXECUTE ON FUNCTION public.reverse_movement() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_movement() TO service_role;
