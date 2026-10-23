ALTER TABLE public.expediente_receipts DROP CONSTRAINT IF EXISTS expediente_receipts_status_check;
ALTER TABLE public.expediente_receipts ADD CONSTRAINT expediente_receipts_status_check CHECK (status IN ('pending','confirmed','not_received'));
ALTER TABLE public.expediente_receipts DROP CONSTRAINT IF EXISTS expediente_receipt_confirmation_consistency;
ALTER TABLE public.expediente_receipts ADD CONSTRAINT expediente_receipt_confirmation_consistency CHECK (
  (status = 'pending' AND confirmed_by IS NULL AND confirmed_at IS NULL)
  OR (status IN ('confirmed','not_received') AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL));

CREATE OR REPLACE FUNCTION public.mark_expediente_receipt_not_received(_receipt_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_unit uuid := public.my_unit(); v_name text;
BEGIN
  IF v_user IS NULL OR NOT public.is_active_user() OR public.is_admin() OR public.is_viewer() THEN
    RAISE EXCEPTION 'Somente o responsável da unidade destinatária pode registrar o não recebimento.';
  END IF;
  SELECT p.nome INTO v_name FROM public.profiles p WHERE p.user_id = v_user AND p.ativo = true;
  UPDATE public.expediente_receipts SET status = 'not_received', confirmed_by = v_user,
    confirmed_by_name = COALESCE(v_name, 'Responsável da unidade'), confirmed_at = now()
  WHERE id = _receipt_id AND destination_unit_id = v_unit AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Recibo não encontrado para sua unidade ou já respondido.'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.mark_expediente_receipt_not_received(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_expediente_receipt_not_received(uuid) TO authenticated, service_role;