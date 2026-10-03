-- Reinício do estoque solicitado pelo administrador.
-- Remove todos os lançamentos, conferências e produtos para começar um cadastro novo.
-- Unidades, usuários e categorias são preservados.
-- O trigger de reversão é suspenso durante a limpeza para não tentar recalcular
-- movimentos que estão sendo apagados em lote.

DROP TRIGGER IF EXISTS trg_reverse_movement ON public.stock_movements;

DELETE FROM public.stock_receipts;
DELETE FROM public.stock_movements;
DELETE FROM public.stock_check_items;
DELETE FROM public.stock_checks;
DELETE FROM public.stock;
DELETE FROM public.products;

CREATE TRIGGER trg_reverse_movement
BEFORE DELETE ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.reverse_movement();
