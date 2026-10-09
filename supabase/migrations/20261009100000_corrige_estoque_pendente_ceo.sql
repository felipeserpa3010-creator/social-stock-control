-- Corrige definitivamente o saldo: recibos pendentes nunca compõem estoque disponível.
-- A confirmação em stock_receipts é o único evento que aplica a entrada pendente.

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
  unit_nome text;
BEGIN
  SELECT ativo, lower(trim(nome))
    INTO unit_ativa, unit_nome
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

  IF NEW.tipo = 'entrada' THEN
    IF unit_nome <> 'gabinete semads'
       AND COALESCE(NEW.observacao, '') NOT ILIKE '%PENDENTE_RECEBIMENTO%' THEN
      RAISE EXCEPTION 'Entrada em unidade exige recibo pendente e confirmação do usuário da unidade.';
    END IF;

    IF COALESCE(NEW.observacao, '') ILIKE '%PENDENTE_RECEBIMENTO%' THEN
      RETURN NEW;
    END IF;
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

DROP TRIGGER IF EXISTS trg_apply_movement ON public.stock_movements;
CREATE TRIGGER trg_apply_movement
BEFORE INSERT ON public.stock_movements
FOR EACH ROW
EXECUTE FUNCTION public.apply_movement();

-- Limpa do saldo atual quantidades de recibos ainda não confirmados
-- que possam ter sido somadas por uma versão anterior do gatilho.
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
      AND COALESCE(sm.observacao, '') NOT ILIKE '%NAO_RECEBIDO%'
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
    AND COALESCE(sm.observacao, '') NOT ILIKE '%NAO_RECEBIDO%'
    AND sm.unit_id = s.unit_id
    AND sm.product_id = s.product_id
);

REVOKE EXECUTE ON FUNCTION public.apply_movement() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_movement() TO service_role;
