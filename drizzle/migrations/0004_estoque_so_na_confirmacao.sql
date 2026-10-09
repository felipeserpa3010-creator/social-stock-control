CREATE OR REPLACE FUNCTION public.apply_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE atual numeric; nova numeric; unit_ativa boolean; unit_nome text;
BEGIN
  SELECT ativo, lower(trim(nome)) INTO unit_ativa, unit_nome FROM public.units WHERE id = NEW.unit_id;
  IF unit_ativa IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Unidade desativada: não é possível registrar movimentações.';
  END IF;
  IF NEW.tipo IN ('conferencia', 'ajuste') THEN RETURN NEW; END IF;
  IF NEW.quantidade <= 0 THEN RAISE EXCEPTION 'A quantidade deve ser maior que zero.'; END IF;
  IF NEW.tipo = 'entrada' THEN
    IF unit_nome <> 'gabinete semads' AND COALESCE(NEW.observacao, '') NOT ILIKE '%PENDENTE_RECEBIMENTO%' THEN
      RAISE EXCEPTION 'Entrada em unidade exige recibo pendente e confirmação do usuário da unidade.';
    END IF;
    IF COALESCE(NEW.observacao, '') ILIKE '%PENDENTE_RECEBIMENTO%' THEN RETURN NEW; END IF;
  END IF;
  INSERT INTO public.stock (unit_id, product_id, quantidade) VALUES (NEW.unit_id, NEW.product_id, 0)
  ON CONFLICT (unit_id, product_id) DO NOTHING;
  SELECT quantidade INTO atual FROM public.stock WHERE unit_id = NEW.unit_id AND product_id = NEW.product_id FOR UPDATE;
  IF NEW.tipo = 'entrada' THEN nova := atual + NEW.quantidade; ELSE nova := atual - NEW.quantidade; END IF;
  IF nova < 0 THEN RAISE EXCEPTION 'Estoque insuficiente. Disponível: %', atual; END IF;
  UPDATE public.stock SET quantidade = nova, updated_at = now() WHERE unit_id = NEW.unit_id AND product_id = NEW.product_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_apply_movement ON public.stock_movements;
CREATE TRIGGER trg_apply_movement BEFORE INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.apply_movement();

UPDATE public.stock s
SET quantidade = GREATEST(0, s.quantidade - COALESCE((
    SELECT SUM(sm.quantidade) FROM public.stock_movements sm
    LEFT JOIN public.stock_receipts sr ON sr.movement_id = sm.id
    WHERE sm.tipo = 'entrada' AND sr.id IS NULL
      AND COALESCE(sm.observacao, '') ILIKE '%PENDENTE_RECEBIMENTO%'
      AND COALESCE(sm.observacao, '') NOT ILIKE '%NAO_RECEBIDO%'
      AND sm.unit_id = s.unit_id AND sm.product_id = s.product_id), 0)),
  updated_at = now()
WHERE EXISTS (
  SELECT 1 FROM public.stock_movements sm
  LEFT JOIN public.stock_receipts sr ON sr.movement_id = sm.id
  WHERE sm.tipo = 'entrada' AND sr.id IS NULL
    AND COALESCE(sm.observacao, '') ILIKE '%PENDENTE_RECEBIMENTO%'
    AND COALESCE(sm.observacao, '') NOT ILIKE '%NAO_RECEBIDO%'
    AND sm.unit_id = s.unit_id AND sm.product_id = s.product_id);

CREATE UNIQUE INDEX IF NOT EXISTS stock_receipts_movement_unique ON public.stock_receipts(movement_id);

CREATE OR REPLACE FUNCTION public.apply_receipt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE m record;
BEGIN
  SELECT * INTO m FROM public.stock_movements WHERE id = NEW.movement_id FOR UPDATE;
  IF m.id IS NULL OR m.tipo <> 'entrada' OR COALESCE(m.observacao,'') NOT ILIKE '%PENDENTE_RECEBIMENTO%' THEN
    RAISE EXCEPTION 'Lançamento não está pendente de recebimento.';
  END IF;
  IF COALESCE(m.observacao,'') ILIKE '%NAO_RECEBIDO%' THEN
    RAISE EXCEPTION 'Este recibo foi marcado como não recebido.';
  END IF;
  INSERT INTO public.stock (unit_id, product_id, quantidade) VALUES (m.unit_id, m.product_id, m.quantidade)
  ON CONFLICT (unit_id, product_id)
  DO UPDATE SET quantidade = public.stock.quantidade + EXCLUDED.quantidade, updated_at = now();
  RETURN NEW;
END; $f$;

DROP TRIGGER IF EXISTS trg_apply_receipt ON public.stock_receipts;
CREATE TRIGGER trg_apply_receipt AFTER INSERT ON public.stock_receipts FOR EACH ROW EXECUTE FUNCTION public.apply_receipt();
REVOKE EXECUTE ON FUNCTION public.apply_receipt() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_movement() FROM PUBLIC, anon, authenticated;