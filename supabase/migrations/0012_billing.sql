-- 0012: billing foundation (Phase 0 — no payment provider yet).
-- Fleet owner = billing unit. Members ride on the owner's plan.
-- Lapsed subscriptions NEVER revoke read access — they degrade write limits
-- to the free tier. Writes to subscriptions/billing_customers are
-- service-role only (webhooks), same pattern as google_drive_connections.

-- ===== Tier reference data (rows, not code — tune without deploys) =====
create table if not exists public.plan_limits (
  tier text primary key,                 -- 'free' | 'individual' | 'family' | 'commercial'
  max_vehicles int not null,
  max_members  int not null,             -- fleet_members rows (owner not counted)
  features jsonb not null default '{}'
);

insert into public.plan_limits (tier, max_vehicles, max_members, features) values
  ('free',        2,  0, '{"ocr": false, "drive_backup": false}'),
  ('individual',  5,  0, '{"ocr": true,  "drive_backup": true}'),
  ('family',     10,  5, '{"ocr": true,  "drive_backup": true}'),
  ('commercial', 25, 15, '{"ocr": true,  "drive_backup": true, "csv_api": true}')
on conflict (tier) do update set
  max_vehicles = excluded.max_vehicles,
  max_members  = excluded.max_members,
  features     = excluded.features;

alter table public.plan_limits enable row level security;
drop policy if exists "limits_read_all" on public.plan_limits;
create policy "limits_read_all" on public.plan_limits
  for select to authenticated using (true);

-- ===== Stripe customer mapping (one per auth user; Phase 1 fills it) =====
create table if not exists public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique not null,
  created_at timestamptz not null default now()
);
alter table public.billing_customers enable row level security;
drop policy if exists "cust_owner_read" on public.billing_customers;
create policy "cust_owner_read" on public.billing_customers
  for select using (user_id = auth.uid());
-- no write policies: service-role only

-- ===== Subscriptions (provider-agnostic: stripe today, app stores later) =====
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'stripe',   -- 'stripe' | 'app_store' | 'play' | 'comp'
  provider_subscription_id text unique,
  tier text not null references public.plan_limits(tier),
  status text not null,                      -- 'trialing'|'active'|'past_due'|'canceled'|'expired'
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  grace_days int not null default 14,        -- annual plans deserve a long grace
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_owner_status_idx
  on public.subscriptions (owner_user_id, status);
alter table public.subscriptions enable row level security;
drop policy if exists "subs_owner_read" on public.subscriptions;
create policy "subs_owner_read" on public.subscriptions
  for select using (owner_user_id = auth.uid());
-- no write policies: service-role only

-- ===== THE entitlement resolver — everything else calls this =====
create or replace function public.effective_tier(owner uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select tier from public.subscriptions
      where owner_user_id = owner
        and status in ('trialing','active','past_due')
        and current_period_end + make_interval(days => grace_days) > now()
      order by current_period_end desc limit 1),
    'free')
$$;

-- Feature check usable from edge functions (service role) for a caller who
-- may be the owner OR a member of an entitled fleet.
create or replace function public.user_has_feature(uid uuid, user_email text, feat text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from (
      select uid as owner
      union
      select owner_user_id from public.fleet_members
        where lower(member_email) = lower(user_email)
    ) o
    join public.plan_limits pl on pl.tier = public.effective_tier(o.owner)
    where coalesce((pl.features ->> feat)::boolean, false)
  )
$$;

-- ===== Insert-time limit triggers (the real wall; client gating is cosmetic) =====
create or replace function public.check_vehicle_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare cap int;
begin
  select max_vehicles into cap from public.plan_limits
    where tier = public.effective_tier(new.user_id);
  if (select count(*) from public.vehicles
        where user_id = new.user_id and archived = false) >= coalesce(cap, 2) then
    raise exception 'PLAN_LIMIT_VEHICLES' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists vehicles_plan_limit on public.vehicles;
create trigger vehicles_plan_limit before insert on public.vehicles
  for each row execute function public.check_vehicle_limit();

create or replace function public.check_member_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare cap int;
begin
  select max_members into cap from public.plan_limits
    where tier = public.effective_tier(new.owner_user_id);
  if (select count(*) from public.fleet_members
        where owner_user_id = new.owner_user_id) >= coalesce(cap, 0) then
    raise exception 'PLAN_LIMIT_MEMBERS' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists members_plan_limit on public.fleet_members;
create trigger members_plan_limit before insert on public.fleet_members
  for each row execute function public.check_member_limit();

-- ===== Comp the founding family so nothing changes for current users =====
insert into public.subscriptions
    (owner_user_id, provider, provider_subscription_id, tier, status,
     current_period_end, grace_days)
select id, 'comp', 'comp-founder', 'family', 'active', '2099-01-01', 0
  from auth.users where email = 'aaronccrow@gmail.com'
on conflict (provider_subscription_id) do nothing;
