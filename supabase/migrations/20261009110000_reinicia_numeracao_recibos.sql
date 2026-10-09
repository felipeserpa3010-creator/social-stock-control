-- Reinicia a numeração dos recibos existentes a partir de 001,
-- preservando a ordem de criação e mantendo o mesmo número em todos os itens
-- que pertencem ao mesmo recibo.
WITH recibos AS (
  SELECT
    (regexp_match(COALESCE(sm.observacao, ''), 'RECIBO_PRODUTOS:([0-9]+)'))[1] AS numero_antigo,
    MIN(sm.created_at) AS criado_em
  FROM public.stock_movements sm
  WHERE (regexp_match(COALESCE(sm.observacao, ''), 'RECIBO_PRODUTOS:([0-9]+)')) IS NOT NULL
  GROUP BY 1
),
mapeamento AS (
  SELECT
    numero_antigo,
    lpad(row_number() OVER (ORDER BY criado_em, numero_antigo::bigint)::text, 3, '0') AS numero_novo
  FROM recibos
)
UPDATE public.stock_movements sm
SET observacao = regexp_replace(
  sm.observacao,
  'RECIBO_PRODUTOS:[0-9]+',
  'RECIBO_PRODUTOS:' || m.numero_novo
)
FROM mapeamento m
WHERE (regexp_match(COALESCE(sm.observacao, ''), 'RECIBO_PRODUTOS:([0-9]+)'))[1] = m.numero_antigo;

-- Garante que os próximos recibos preencham a menor numeração livre.
-- A função também usa lock transacional para evitar números duplicados
-- quando dois recibos forem emitidos ao mesmo tempo.
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
