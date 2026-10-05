-- Recebimentos pendentes não alteram o saldo da unidade.
-- O saldo passa a ser atualizado somente no momento da confirmação.

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

  -- Entrada enviada pelo CEO só entra no estoque depois da confirmação da unidade.
  IF NEW.tipo = 'entrada'
     AND COALESCE(NEW.observacao, '') ILIKE '%PENDENTE_RECEBIMENTO%' THEN
    RETURN NEW;
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

-- Corrige lançamentos pendentes antigos que foram somados ao estoque pelo
-- gatilho anterior. Eles voltam a ficar fora do saldo até a confirmação.
UPDATE public.stock s
SET quantidade = GREATEST(
  0,
  s.quantidade - COALESCE((
    SELECT SUM(sm.quantidade)
    FROM public.stock_movements sm
    LEFT JOIN public.stock_receipts sr ON sr.movement_id = sm.id
    WHERE sm.tipo = 'entrada'
      AND sr.id IS NULL
      AND COALESCE(sm.observacao, '') ILIKE '%PENDENTE_RECEBIMENTO%'
      AND sm.unit_id = s.unit_id
      AND sm.product_id = s.product_id
  ), 0)
),
updated_at = now()
WHERE EXISTS (
  SELECT 1
  FROM public.stock_movements sm
  LEFT JOIN public.stock_receipts sr ON sr.movement_id = sm.id
  WHERE sm.tipo = 'entrada'
    AND sr.id IS NULL
    AND COALESCE(sm.observacao, '') ILIKE '%PENDENTE_RECEBIMENTO%'
    AND sm.unit_id = s.unit_id
    AND sm.product_id = s.product_id
);

CREATE OR REPLACE FUNCTION public.apply_confirmed_receipt()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  m public.stock_movements%ROWTYPE;
  atual numeric;
BEGIN
  SELECT * INTO m
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
  WHERE unit_id = m.unit_id AND product_id = m.product_id
  FOR UPDATE;

  UPDATE public.stock
  SET quantidade = atual + m.quantidade,
      updated_at = now()
  WHERE unit_id = m.unit_id AND product_id = m.product_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_confirmed_receipt ON public.stock_receipts;
CREATE TRIGGER trg_apply_confirmed_receipt
AFTER INSERT ON public.stock_receipts
FOR EACH ROW
EXECUTE FUNCTION public.apply_confirmed_receipt();

REVOKE EXECUTE ON FUNCTION public.apply_confirmed_receipt() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_confirmed_receipt() TO service_role;
