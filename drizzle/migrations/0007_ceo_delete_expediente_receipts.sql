-- Permite exclusivamente ao CEO excluir recibos de materiais de expediente.
-- Os itens são removidos automaticamente pela FK ON DELETE CASCADE.
CREATE OR REPLACE FUNCTION public.delete_expediente_receipt(_receipt_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Somente o CEO pode excluir recibos de materiais de expediente.';
  END IF;

  DELETE FROM public.expediente_receipts
  WHERE id = _receipt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recibo de expediente não encontrado.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_expediente_receipt(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_expediente_receipt(uuid) TO authenticated, service_role;
GRANT ALL ON public.expediente_receipts, public.expediente_receipt_items TO service_role;
