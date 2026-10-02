create table if not exists public.stock_receipts (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references public.stock_movements(id) on delete cascade,
  confirmed_by uuid not null references auth.users(id) on delete restrict,
  confirmed_by_name text not null,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint stock_receipts_movement_id_key unique (movement_id)
);

alter table public.stock_receipts enable row level security;
grant select, insert on public.stock_receipts to authenticated;

create policy "stock_receipts_select" on public.stock_receipts for select to authenticated using (
  exists (select 1 from public.stock_movements sm where sm.id = stock_receipts.movement_id and public.can_access_unit(sm.unit_id))
);

create policy "stock_receipts_insert" on public.stock_receipts for insert to authenticated with check (
  confirmed_by = auth.uid()
  and exists (
    select 1 from public.stock_movements sm
    join public.profiles p on p.user_id = auth.uid()
    join public.user_roles ur on ur.user_id = auth.uid()
    where sm.id = stock_receipts.movement_id and sm.tipo = 'entrada'
      and p.ativo = true and p.unit_id = sm.unit_id and ur.role = 'responsavel'
  )
);