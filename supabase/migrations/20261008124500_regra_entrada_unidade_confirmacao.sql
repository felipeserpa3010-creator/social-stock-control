-- Regra definitiva e obrigatória no banco:
-- * Entrada no Depósito Central (Gabinete SEMADS): entra imediatamente.
-- * Entrada destinada a qualquer outra unidade: obrigatoriamente fica pendente
--   e só pode alterar o estoque após a confirmação do usuário da unidade.
-- Esta trava evita que um fluxo antigo ou uma nova tela consiga contornar a regra.

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
    -- Toda entrada fora do Depósito Central precisa estar vinculada a um
    -- recibo pendente. Sem isso, o banco bloqueia a entrada para a unidade.
    IF unit_nome <> 'gabinete semads'
       AND COALESCE(NEW.observacao, '') NOT ILIKE '%PENDENTE_RECEBIMENTO%' THEN
      RAISE EXCEPTION 'Entrada de unidade exige Recibo de Produtos e confirmação do usuário da própria unidade.';
    END IF;

    -- Entrada pendente não altera o saldo.
    IF COALESCE(NEW.observacao, '') ILIKE '%PENDENTE_RECEBIMENTO%' THEN
      RETURN NEW;
    END IF;
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

DROP TRIGGER IF EXISTS trg_apply_movement ON public.stock_movements;
CREATE TRIGGER trg_apply_movement
BEFORE INSERT ON public.stock_movements
FOR EACH ROW
EXECUTE FUNCTION public.apply_movement();

REVOKE EXECUTE ON FUNCTION public.apply_movement() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_movement() TO service_role;
