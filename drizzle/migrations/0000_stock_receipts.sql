CREATE TABLE public.stock_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_id uuid NOT NULL UNIQUE REFERENCES public.stock_movements(id) ON DELETE CASCADE,
  confirmed_by uuid NOT NULL,
  confirmed_by_name text NOT NULL DEFAULT '',
  confirmed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.stock_receipts TO authenticated;
GRANT ALL ON public.stock_receipts TO service_role;
ALTER TABLE public.stock_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY receipts_select ON public.stock_receipts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stock_movements m WHERE m.id = movement_id AND public.can_access_unit(m.unit_id)));
CREATE POLICY receipts_insert ON public.stock_receipts FOR INSERT TO authenticated
  WITH CHECK (confirmed_by = auth.uid() AND public.has_role(auth.uid(), 'responsavel') AND EXISTS (
    SELECT 1 FROM public.stock_movements m WHERE m.id = movement_id AND m.unit_id = public.my_unit() AND m.tipo = 'entrada'));

CREATE SEQUENCE IF NOT EXISTS public.stock_receipt_number_seq;
GRANT USAGE ON SEQUENCE public.stock_receipt_number_seq TO authenticated;
CREATE OR REPLACE FUNCTION public.next_stock_receipt_number()
RETURNS text LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'REC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.stock_receipt_number_seq')::text, 5, '0');
$$;
REVOKE EXECUTE ON FUNCTION public.next_stock_receipt_number() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.next_stock_receipt_number() TO authenticated;