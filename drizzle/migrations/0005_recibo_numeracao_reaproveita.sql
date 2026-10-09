CREATE OR REPLACE FUNCTION public.next_stock_receipt_number()
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE candidate bigint; mx bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(728341);
  SELECT COALESCE(MAX((substring(observacao from 'RECIBO_PRODUTOS:REC-[0-9]{4}-([0-9]+)'))::bigint),0)
    INTO mx FROM public.stock_movements;
  SELECT MIN(s.n) INTO candidate FROM generate_series(1, mx + 1) s(n)
  WHERE NOT EXISTS (SELECT 1 FROM public.stock_movements sm
    WHERE (substring(sm.observacao from 'RECIBO_PRODUTOS:REC-[0-9]{4}-([0-9]+)'))::bigint = s.n);
  RETURN 'REC-' || to_char(now(),'YYYY') || '-' || lpad(COALESCE(candidate,1)::text, 3, '0');
END; $$;
REVOKE ALL ON FUNCTION public.next_stock_receipt_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_stock_receipt_number() TO authenticated;