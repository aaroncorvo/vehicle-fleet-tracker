-- Fleet Tracker: initial schema
-- Single-user personal app. All tables RLS-protected, scoped to auth.uid().

create extension if not exists "pgcrypto";

-- ============ VEHICLES ============
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,                -- display name, e.g. "GX460"
  nickname text,                     -- e.g. "Ghost"
  year int not null,
  make text not null,
  model text not null,
  vin text,
  engine text,                       -- e.g. "1UR-FE 4.6L V8"
  base_odometer int not null default 0,  -- odometer at time of adding vehicle
  fuel_octane text,                  -- default octane, e.g. "93 Premium"
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============ FUEL LOGS ============
create table public.fuel_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  filled_at date not null,
  fill_time text,                    -- optional "1:41 PM"
  odometer int not null,
  fill_type text not null default 'full' check (fill_type in ('full','partial','reset')),
  gallons numeric(8,3) not null check (gallons > 0),
  cost_per_gallon numeric(6,3),
  total_cost numeric(8,2),
  octane text,
  brand text,
  location text,
  payment text,
  notes text,
  created_at timestamptz not null default now()
);
create index fuel_logs_vehicle_odo on public.fuel_logs (vehicle_id, odometer);

-- ============ SERVICE LOGS ============
create table public.service_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  serviced_at date not null,
  odometer int,
  service_type text not null,        -- "Oil Change", "Brake Pads", etc.
  parts text,                        -- parts used / part numbers
  cost numeric(8,2),
  shop text,                         -- "DIY" or shop name
  notes text,
  created_at timestamptz not null default now()
);
create index service_logs_vehicle on public.service_logs (vehicle_id, serviced_at);

-- ============ MAINTENANCE ITEMS (interval tracking) ============
create table public.maintenance_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  name text not null,                -- "Engine Oil", "Transfer Case Fluid", "KDSS Fluid"
  interval_miles int,                -- null = time-based only
  interval_months int,               -- null = mileage-based only
  last_done_miles int,
  last_done_date date,
  part_number text,
  notes text,
  created_at timestamptz not null default now()
);
create index maintenance_items_vehicle on public.maintenance_items (vehicle_id);

-- ============ ROW LEVEL SECURITY ============
alter table public.vehicles enable row level security;
alter table public.fuel_logs enable row level security;
alter table public.service_logs enable row level security;
alter table public.maintenance_items enable row level security;

-- Owner-only policies on every table
create policy "vehicles_owner" on public.vehicles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "fuel_logs_owner" on public.fuel_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "service_logs_owner" on public.service_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "maintenance_items_owner" on public.maintenance_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
