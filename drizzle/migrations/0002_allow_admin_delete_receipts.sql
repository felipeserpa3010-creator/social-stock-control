-- Permitir que o administrador exclua lançamentos (recibos pendentes/confirmados)
CREATE POLICY "mov_delete_admin"
  ON public.stock_movements
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

GRANT DELETE ON public.stock_movements TO authenticated;

-- Permitir que o administrador remova confirmações de recebimento ao excluir um recibo
CREATE POLICY "receipts_delete_admin"
  ON public.stock_receipts
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

GRANT DELETE ON public.stock_receipts TO authenticated;
