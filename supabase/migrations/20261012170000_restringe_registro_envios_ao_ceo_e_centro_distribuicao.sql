-- Somente o CEO (admin) e usuários ativos vinculados ao Centro de Distribuição
-- podem registrar envios de materiais de expediente/outros materiais.
-- Usuários das unidades continuam podendo consultar e confirmar seus próprios recibos.

CREATE OR REPLACE FUNCTION public.is_expediente_dispatcher()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.units u ON u.id = p.unit_id
      JOIN public.user_roles ur ON ur.user_id = p.user_id
      WHERE p.user_id = auth.uid()
        AND p.ativo = true
        AND lower(trim(u.nome)) LIKE '%centro de distribui%'
        AND ur.role IN ('visualizador', 'responsavel')
    );
$$;

REVOKE ALL ON FUNCTION public.is_expediente_dispatcher() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_expediente_dispatcher() TO authenticated, service_role;

-- Reaplica a regra no RPC de criação para impedir chamadas diretas por usuários
-- comuns de unidade, mesmo que tentem ignorar a interface.
CREATE OR REPLACE FUNCTION public.create_expediente_receipt(
  _destination_unit_id uuid,
  _sent_at date,
  _items jsonb,
  _note text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_name text;
  v_number bigint;
  v_receipt_id uuid;
  v_item jsonb;
  v_item_count integer := 0;
BEGIN
  IF v_user IS NULL OR NOT public.is_expediente_dispatcher() THEN
    RAISE EXCEPTION 'Somente o CEO ou usuário cadastrado no Centro de Distribuição pode registrar envios de materiais.';
  END IF;
  IF _destination_unit_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.units WHERE id = _destination_unit_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Selecione uma unidade destinatária ativa.';
  END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Informe pelo menos um material.';
  END IF;
  IF _sent_at IS NULL OR _sent_at > current_date THEN
    RAISE EXCEPTION 'A data do envio é inválida.';
  END IF;

  SELECT COALESCE(p.nome, 'Usuário SEMADS') INTO v_name
  FROM public.profiles p WHERE p.user_id = v_user AND p.ativo = true;
  v_name := COALESCE(v_name, 'Usuário SEMADS');

  PERFORM pg_advisory_xact_lock(728342);
  SELECT COALESCE(MIN(n), 1) INTO v_number
  FROM generate_series(
    1,
    GREATEST(1, COALESCE((SELECT MAX(NULLIF(regexp_replace(receipt_number, '[^0-9]', '', 'g'), '')::bigint)
      FROM public.expediente_receipts), 0) + 1)
  ) AS s(n)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.expediente_receipts r
    WHERE NULLIF(regexp_replace(r.receipt_number, '[^0-9]', '', 'g'), '')::bigint = s.n
  );

  INSERT INTO public.expediente_receipts
    (receipt_number, destination_unit_id, sent_by, sent_by_name, sent_at, note)
  VALUES (lpad(v_number::text, 3, '0'), _destination_unit_id, v_user, v_name, _sent_at, NULLIF(trim(_note), ''))
  RETURNING id INTO v_receipt_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(_items)
  LOOP
    IF NULLIF(trim(COALESCE(v_item->>'name', '')), '') IS NULL
      OR COALESCE((v_item->>'quantity')::numeric, 0) <= 0
      OR NULLIF(trim(COALESCE(v_item->>'unit', '')), '') IS NULL THEN
      RAISE EXCEPTION 'Cada material precisa ter nome, quantidade positiva e unidade de medida.';
    END IF;
    INSERT INTO public.expediente_receipt_items (receipt_id, material_name, quantity, unit_measure)
    VALUES (v_receipt_id, trim(v_item->>'name'), (v_item->>'quantity')::numeric, trim(v_item->>'unit'));
    v_item_count := v_item_count + 1;
  END LOOP;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'Informe pelo menos um material válido.';
  END IF;
  RETURN lpad(v_number::text, 3, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.create_expediente_receipt(uuid, date, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_expediente_receipt(uuid, date, jsonb, text) TO authenticated, service_role;
