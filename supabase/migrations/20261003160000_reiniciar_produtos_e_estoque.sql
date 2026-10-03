-- Reinício do estoque solicitado pelo administrador.
-- Remove todos os lançamentos, conferências e produtos para começar um cadastro novo.
-- Unidades, usuários e categorias são preservados.

DELETE FROM public.stock_receipts;
DELETE FROM public.stock_movements;
DELETE FROM public.stock_check_items;
DELETE FROM public.stock_checks;
DELETE FROM public.stock;
DELETE FROM public.products;
