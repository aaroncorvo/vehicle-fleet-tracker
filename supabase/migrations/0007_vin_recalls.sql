-- VIN decode storage + NHTSA recall tracking.
-- Run in SQL Editor of project fxycfrtycqxdlhrpfeiv AFTER 0006.

alter table public.vehicles
  add column if not exists vin_decode jsonb;    -- curated NHTSA vPIC decode

create table if not exists public.recalls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  campaign text not null,            -- NHTSA campaign number, e.g. 20V012000
  component text,
  summary text,
  consequence text,
  remedy text,
  report_date text,
  status text not null default 'open' check (status in ('open', 'resolved', 'na')),
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (vehicle_id, campaign)
);
create index if not exists recalls_vehicle on public.recalls (vehicle_id);

alter table public.recalls enable row level security;
drop policy if exists "recalls_owner" on public.recalls;
create policy "recalls_owner" on public.recalls
  for all using (user_id in (select public.accessible_owner_ids()))
  with check (user_id in (select public.accessible_owner_ids()));
