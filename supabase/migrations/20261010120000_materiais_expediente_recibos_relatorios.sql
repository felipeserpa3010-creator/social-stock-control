-- Módulo independente de Materiais de Expediente: registro de envios, recibos e confirmação.
CREATE TABLE IF NOT EXISTS public.expediente_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number text NOT NULL UNIQUE,
  destination_unit_id uuid NOT NULL REFERENCES public.units(id),
  sent_by uuid NOT NULL REFERENCES auth.users(id),
  sent_by_name text NOT NULL DEFAULT '',
  sent_at date NOT NULL DEFAULT current_date,
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed')),
  confirmed_by uuid REFERENCES auth.users(id),
  confirmed_by_name text,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expediente_receipt_confirmation_consistency CHECK (
    (status = 'pending' AND confirmed_by IS NULL AND confirmed_at IS NULL)
    OR (status = 'confirmed' AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.expediente_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.expediente_receipts(id) ON DELETE CASCADE,
  material_name text NOT NULL CHECK (length(trim(material_name)) > 0),
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_measure text NOT NULL DEFAULT 'unidade',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expediente_receipts_destination_sent_idx
  ON public.expediente_receipts(destination_unit_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS expediente_receipts_status_confirmed_idx
  ON public.expediente_receipts(status, confirmed_at DESC);
CREATE INDEX IF NOT EXISTS expediente_items_receipt_idx
  ON public.expediente_receipt_items(receipt_id);

CREATE OR REPLACE FUNCTION public.is_expediente_dispatcher()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.units u ON u.id = p.unit_id
      WHERE p.user_id = auth.uid()
        AND p.ativo = true
        AND lower(trim(u.nome)) LIKE '%gabinete semads%'
        AND EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid() AND ur.role IN ('visualizador', 'responsavel')
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.units u ON u.id = p.unit_id
      WHERE p.user_id = auth.uid()
        AND p.ativo = true
        AND lower(trim(u.nome)) LIKE '%centro de distribui%' OR lower(trim(u.nome)) LIKE '%centro de distribuição%'
        AND EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid() AND ur.role IN ('visualizador', 'responsavel')
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.create_expediente_receipt(
  _destination_unit_id uuid,
  _sent_at date,
  _items jsonb,
  _note text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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
    RAISE EXCEPTION 'Somente o CEO ou o Centro de Distribuição pode registrar envios de materiais de expediente.';
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

CREATE OR REPLACE FUNCTION public.confirm_expediente_receipt(_receipt_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_unit uuid := public.my_unit();
  v_name text;
BEGIN
  IF v_user IS NULL OR NOT public.is_active_user() OR public.is_admin() OR public.is_viewer() THEN
    RAISE EXCEPTION 'Somente o responsável da unidade destinatária pode confirmar o recebimento.';
  END IF;
  SELECT p.nome INTO v_name FROM public.profiles p
  WHERE p.user_id = v_user AND p.ativo = true;
  UPDATE public.expediente_receipts
  SET status = 'confirmed', confirmed_by = v_user,
      confirmed_by_name = COALESCE(v_name, 'Responsável da unidade'),
      confirmed_at = now()
  WHERE id = _receipt_id
    AND destination_unit_id = v_unit
    AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recibo não encontrado para sua unidade ou já confirmado.';
  END IF;
END;
$$;

ALTER TABLE public.expediente_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expediente_receipt_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expediente_receipts_select ON public.expediente_receipts;
CREATE POLICY expediente_receipts_select ON public.expediente_receipts
FOR SELECT TO authenticated
USING (public.is_admin() OR public.is_expediente_dispatcher() OR destination_unit_id = public.my_unit());

DROP POLICY IF EXISTS expediente_items_select ON public.expediente_receipt_items;
CREATE POLICY expediente_items_select ON public.expediente_receipt_items
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.expediente_receipts r
  WHERE r.id = receipt_id
    AND (public.is_admin() OR public.is_expediente_dispatcher() OR r.destination_unit_id = public.my_unit())
));

REVOKE ALL ON FUNCTION public.is_expediente_dispatcher() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_expediente_dispatcher() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_expediente_receipt(uuid, date, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_expediente_receipt(uuid, date, jsonb, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.confirm_expediente_receipt(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_expediente_receipt(uuid) TO authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE ON public.expediente_receipts, public.expediente_receipt_items FROM authenticated;
GRANT SELECT ON public.expediente_receipts, public.expediente_receipt_items TO authenticated;
