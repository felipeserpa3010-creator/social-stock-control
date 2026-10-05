create sequence if not exists public.stock_receipt_number_seq start 1 increment 1 minvalue 1;

create or replace function public.next_stock_receipt_number()
returns text
language sql
security definer
set search_path = public
as $$
  select lpad(nextval('public.stock_receipt_number_seq')::text, 5, '0');
$$;

revoke all on function public.next_stock_receipt_number() from public;
grant execute on function public.next_stock_receipt_number() to authenticated;
