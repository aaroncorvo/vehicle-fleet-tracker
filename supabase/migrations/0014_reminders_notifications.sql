-- 0014: user-defined reminders (with recurrence), in-app notification inbox,
-- webhook notification providers, and receipt attachments on fuel fill-ups.

-- ===== Reminders: registration renewals, inspections, seasonal tasks =====
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete cascade,  -- null = fleet-wide
  title text not null,
  due_date date not null,
  remind_days_before int not null default 14,
  recurrence text not null default 'none'
    check (recurrence in ('none', 'weekly', 'monthly', 'yearly')),
  recurrence_interval int not null default 1 check (recurrence_interval >= 1),
  notes text,
  completed_at timestamptz,          -- non-recurring: done; recurring: roll due_date instead
  created_at timestamptz not null default now()
);
create index if not exists reminders_user_due_idx on public.reminders (user_id, due_date);
alter table public.reminders enable row level security;
drop policy if exists "reminders_fleet" on public.reminders;
create policy "reminders_fleet" on public.reminders
  for all using (user_id in (select public.accessible_owner_ids()))
  with check (user_id in (select public.accessible_owner_ids()));

-- ===== In-app notification inbox =====
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,  -- fleet owner
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  kind text not null,                -- 'recall'|'maintenance'|'reminder'|'document'|'system'
  dedupe_key text unique,            -- e.g. 'recall:<campaign>' — prevents repeats
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "notifications_fleet" on public.notifications;
create policy "notifications_fleet" on public.notifications
  for all using (user_id in (select public.accessible_owner_ids()))
  with check (user_id in (select public.accessible_owner_ids()));

-- ===== Notification providers (webhook push: ntfy / Discord / generic) =====
create table if not exists public.notification_providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('ntfy', 'discord', 'webhook')),
  config jsonb not null default '{}',   -- { "url": ... } (+ ntfy: topic in url)
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.notification_providers enable row level security;
drop policy if exists "providers_own" on public.notification_providers;
create policy "providers_own" on public.notification_providers
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ===== Receipts attachable to fuel fill-ups =====
alter table public.receipts
  add column if not exists fuel_log_id uuid references public.fuel_logs(id) on delete set null;
