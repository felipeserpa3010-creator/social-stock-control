-- Garante a regra definitiva do estoque:
-- 1) lançamento de entrada pendente NÃO altera o estoque;
-- 2) a entrada só altera o estoque quando o usuário da unidade confirma o recebimento;
-- 3) excluir uma entrada pendente não altera o estoque;
-- 4) excluir uma entrada já confirmada reverte o estoque;
-- 5) corrige saldos que tenham sido contaminados por entradas pendentes antigas.

CREATE OR REPLACE FUNCTION public.apply_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  atual numeric;
  nova numeric;
  unit_ativa boolean;
BEGIN
  SELECT ativo INTO unit_ativa
  FROM public.units
  WHERE id = NEW.unit_id;

  IF unit_ativa IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Unidade desativada: não é possível registrar movimentações.';
  END IF;

  IF NEW.tipo NOT IN ('entrada', 'saida') THEN
    RAISE EXCEPTION 'Tipo de movimentação não permitido pelo fluxo atual.';
  END IF;

  IF NEW.quantidade <= 0 THEN
    RAISE EXCEPTION 'A quantidade deve ser maior que zero.';
  END IF;

  -- Entrada vinculada a recibo pendente: não entra no saldo.
  IF NEW.tipo = 'entrada'
     AND COALESCE(NEW.observacao, '') ILIKE '%PENDENTE_RECEBIMENTO%' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.stock (unit_id, product_id, quantidade)
  VALUES (NEW.unit_id, NEW.product_id, 0)
  ON CONFLICT (unit_id, product_id) DO NOTHING;

  SELECT quantidade INTO atual
  FROM public.stock
  WHERE unit_id = NEW.unit_id
    AND product_id = NEW.product_id
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
  SET quantidade = nova,
      updated_at = now()
  WHERE unit_id = NEW.unit_id
    AND product_id = NEW.product_id;

  RETURN NEW;
END;
$$;

-- O gatilho original continua usando a função acima, pois CREATE OR REPLACE
-- preserva a identidade da função. Reforçamos aqui para evitar duplicidade.
DROP TRIGGER IF EXISTS trg_apply_movement ON public.stock_movements;
CREATE TRIGGER trg_apply_movement
BEFORE INSERT ON public.stock_movements
FOR EACH ROW
EXECUTE FUNCTION public.apply_movement();

CREATE OR REPLACE FUNCTION public.apply_confirmed_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.stock_movements%ROWTYPE;
  atual numeric;
BEGIN
  SELECT *
  INTO m
  FROM public.stock_movements
  WHERE id = NEW.movement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimentação do recebimento não encontrada.';
  END IF;

  IF m.tipo <> 'entrada' THEN
    RAISE EXCEPTION 'Somente entradas podem ser confirmadas como recebimento.';
  END IF;

  INSERT INTO public.stock (unit_id, product_id, quantidade)
  VALUES (m.unit_id, m.product_id, 0)
  ON CONFLICT (unit_id, product_id) DO NOTHING;

  SELECT quantidade INTO atual
  FROM public.stock
  WHERE unit_id = m.unit_id
    AND product_id = m.product_id
  FOR UPDATE;

  UPDATE public.stock
  SET quantidade = atual + m.quantidade,
      updated_at = now()
  WHERE unit_id = m.unit_id
    AND product_id = m.product_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_confirmed_receipt ON public.stock_receipts;
CREATE TRIGGER trg_apply_confirmed_receipt
AFTER INSERT ON public.stock_receipts
FOR EACH ROW
EXECUTE FUNCTION public.apply_confirmed_receipt();

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
    )
    INTO v_confirmado;

    -- Nunca subtrai estoque de uma entrada que ainda não foi confirmada.
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
    -- Uma entrada pendente pode não possuir linha de estoque.
    RETURN OLD;
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

-- BEFORE DELETE garante que uma entrada confirmada seja revertida antes
-- da exclusão em cascata da confirmação em stock_receipts.
DROP TRIGGER IF EXISTS trg_reverse_movement ON public.stock_movements;
DROP TRIGGER IF EXISTS trg_reverse_movement_before ON public.stock_movements;
CREATE TRIGGER trg_reverse_movement_before
BEFORE DELETE ON public.stock_movements
FOR EACH ROW
EXECUTE FUNCTION public.reverse_movement();

-- Recalcula o saldo derivado do zero, excluindo todas as entradas pendentes
-- ainda não confirmadas. Isso corrige saldos que foram somados por versões
-- anteriores do gatilho.
DELETE FROM public.stock;

INSERT INTO public.stock (unit_id, product_id, quantidade, updated_at)
SELECT
  sm.unit_id,
  sm.product_id,
  GREATEST(
    0,
    SUM(
      CASE
        WHEN sm.tipo = 'saida' THEN -sm.quantidade
        WHEN sm.tipo = 'entrada'
          AND (
            COALESCE(sm.observacao, '') NOT ILIKE '%PENDENTE_RECEBIMENTO%'
            OR EXISTS (
              SELECT 1
              FROM public.stock_receipts sr
              WHERE sr.movement_id = sm.id
            )
          )
          THEN sm.quantidade
        ELSE 0
      END
    )
  ) AS quantidade,
  now()
FROM public.stock_movements sm
GROUP BY sm.unit_id, sm.product_id
HAVING GREATEST(
  0,
  SUM(
    CASE
      WHEN sm.tipo = 'saida' THEN -sm.quantidade
      WHEN sm.tipo = 'entrada'
        AND (
          COALESCE(sm.observacao, '') NOT ILIKE '%PENDENTE_RECEBIMENTO%'
          OR EXISTS (
            SELECT 1
            FROM public.stock_receipts sr
            WHERE sr.movement_id = sm.id
          )
        )
        THEN sm.quantidade
      ELSE 0
    END
  )
) > 0;

REVOKE EXECUTE ON FUNCTION public.apply_movement() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_confirmed_receipt() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reverse_movement() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_movement() TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_confirmed_receipt() TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_movement() TO service_role;
