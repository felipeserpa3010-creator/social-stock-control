-- Auditoria e correções do fluxo de recibos/depósito central.
-- Mantém a regra: entrada destinada à unidade só altera estoque após confirmação.

-- Corrige o RPC do Depósito Central para aceitar o número da Ordem de Fornecimento
-- enviado pelo cliente e persistir esse número no recibo.
DROP FUNCTION IF EXISTS public.send_from_central_deposit(uuid, uuid, numeric, date, text);

CREATE OR REPLACE FUNCTION public.send_from_central_deposit(
  _product_id uuid,
  _destination_unit_id uuid,
  _quantity numeric,
  _data date DEFAULT current_date,
  _observacao text DEFAULT NULL,
  _receipt_number text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_source_unit uuid;
  v_source_name text;
  v_destination_name text;
  v_available numeric;
  v_receipt text;
  v_obs text;
  v_of text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_user AND role = 'visualizador'
  ) THEN
    RAISE EXCEPTION 'Acesso negado: somente o usuário do Depósito Central pode distribuir materiais.';
  END IF;

  SELECT p.unit_id, u.nome
    INTO v_source_unit, v_source_name
  FROM public.profiles p
  JOIN public.units u ON u.id = p.unit_id
  WHERE p.user_id = v_user AND p.ativo = true;

  IF v_source_unit IS NULL OR lower(trim(v_source_name)) <> 'gabinete semads' THEN
    RAISE EXCEPTION 'Este usuário não está vinculado ao Gabinete SEMADS.';
  END IF;

  IF _destination_unit_id IS NULL OR _destination_unit_id = v_source_unit THEN
    RAISE EXCEPTION 'Selecione uma unidade de destino diferente do Depósito Central.';
  END IF;

  SELECT nome INTO v_destination_name
  FROM public.units
  WHERE id = _destination_unit_id AND ativo = true;

  IF v_destination_name IS NULL THEN
    RAISE EXCEPTION 'Unidade de destino inválida ou desativada.';
  END IF;

  IF _quantity IS NULL OR _quantity <= 0 THEN
    RAISE EXCEPTION 'A quantidade deve ser maior que zero.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.products
    WHERE id = _product_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Produto não encontrado ou desativado.';
  END IF;

  SELECT COALESCE(quantidade, 0) INTO v_available
  FROM public.stock
  WHERE unit_id = v_source_unit AND product_id = _product_id
  FOR UPDATE;

  IF COALESCE(v_available, 0) < _quantity THEN
    RAISE EXCEPTION 'Estoque insuficiente no Depósito Central. Disponível: %', COALESCE(v_available, 0);
  END IF;

  v_receipt := public.next_stock_receipt_number();
  v_obs := 'RECIBO_PRODUTOS:' || v_receipt || '|ENVIO_DEPOSITO_CENTRAL|PENDENTE_RECEBIMENTO';

  v_of := NULLIF(trim(COALESCE(_receipt_number, '')), '');
  IF v_of IS NOT NULL THEN
    v_obs := v_obs || '|ORDEM_FORNECIMENTO:' || left(v_of, 100);
  END IF;

  IF NULLIF(trim(COALESCE(_observacao, '')), '') IS NOT NULL THEN
    v_obs := v_obs || '|OBS:' || left(trim(_observacao), 500);
  END IF;

  INSERT INTO public.stock_movements (
    unit_id, product_id, tipo, quantidade, data, user_id, responsavel, observacao
  ) VALUES (
    v_source_unit, _product_id, 'saida', _quantity, COALESCE(_data, current_date),
    v_user, v_source_name, v_obs
  );

  INSERT INTO public.stock_movements (
    unit_id, product_id, tipo, quantidade, data, user_id, responsavel, observacao
  ) VALUES (
    _destination_unit_id, _product_id, 'entrada', _quantity, COALESCE(_data, current_date),
    v_user, v_source_name, v_obs
  );

  RETURN v_receipt;
END;
$$;

REVOKE ALL ON FUNCTION public.send_from_central_deposit(uuid, uuid, numeric, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_from_central_deposit(uuid, uuid, numeric, date, text, text) TO authenticated, service_role;
