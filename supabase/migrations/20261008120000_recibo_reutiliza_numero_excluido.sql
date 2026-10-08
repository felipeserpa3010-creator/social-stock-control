-- Reutiliza automaticamente o menor número de recibo que estiver livre.
-- Se o recibo 003 for excluído, o próximo recibo volta a ser 003.
-- Apenas recibos ainda presentes em stock_movements são considerados ocupados.
-- O lock transacional evita que duas emissões simultâneas recebam o mesmo número.

CREATE OR REPLACE FUNCTION public.next_stock_receipt_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(728341);

  SELECT COALESCE(
    (
      SELECT MIN(s.n)
      FROM generate_series(
        1,
        GREATEST(
          1,
          COALESCE(
            (
              SELECT MAX((m.match[1])::bigint)
              FROM (
                SELECT regexp_match(
                  COALESCE(sm.observacao, ''),
                  'RECIBO_PRODUTOS:([0-9]+)'
                ) AS match
                FROM public.stock_movements sm
              ) m
              WHERE m.match IS NOT NULL
            ),
            0
          ) + 1
        )
      ) AS s(n)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.stock_movements sm
        WHERE (regexp_match(
          COALESCE(sm.observacao, ''),
          'RECIBO_PRODUTOS:([0-9]+)'
        ))[1]::bigint = s.n
      )
    ),
    1
  ) INTO candidate;

  RETURN lpad(candidate::text, 3, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_stock_receipt_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_stock_receipt_number() TO authenticated;
