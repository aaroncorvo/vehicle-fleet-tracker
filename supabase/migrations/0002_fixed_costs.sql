-- Fixed costs: recurring per-vehicle ownership costs (insurance, registration,
-- inspection) that exist regardless of miles driven. Feeds the TCO rollup.
-- Run in SQL Editor of project fxycfrtycqxdlhrpfeiv AFTER 0001_init.sql.

create table if not exists public.fixed_costs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  name text not null,                -- "Insurance", "Registration", "State Inspection"
  amount numeric(8,2) not null check (amount >= 0),
  period text not null default 'year' check (period in ('month','year')),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists fixed_costs_vehicle on public.fixed_costs (vehicle_id);

alter table public.fixed_costs enable row level security;

drop policy if exists "fixed_costs_owner" on public.fixed_costs;
create policy "fixed_costs_owner" on public.fixed_costs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
