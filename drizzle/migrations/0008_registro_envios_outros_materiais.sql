-- Registro de envios: separar materiais de expediente e outros materiais sem movimentar estoque.
ALTER TABLE public.expediente_receipts
  ADD COLUMN IF NOT EXISTS material_type text NOT NULL DEFAULT 'expediente'
  CHECK (material_type IN ('expediente', 'outros'));

CREATE INDEX IF NOT EXISTS expediente_receipts_material_type_idx
  ON public.expediente_receipts(material_type, sent_at DESC);

-- Mantém a função existente e reaproveita seus controles de acesso, numeração e validação.
CREATE OR REPLACE FUNCTION public.create_expediente_receipt(
  _destination_unit_id uuid,
  _sent_at date,
  _items jsonb,
  _note text,
  _material_type text
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_number text;
BEGIN
  IF _material_type NOT IN ('expediente', 'outros') THEN
    RAISE EXCEPTION 'Tipo de material inválido.';
  END IF;

  v_number := public.create_expediente_receipt(
    _destination_unit_id,
    _sent_at,
    _items,
    _note
  );

  UPDATE public.expediente_receipts
  SET material_type = _material_type
  WHERE receipt_number = v_number;

  RETURN v_number;
END;
$$;

REVOKE ALL ON FUNCTION public.create_expediente_receipt(uuid, date, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_expediente_receipt(uuid, date, jsonb, text, text) TO authenticated, service_role;