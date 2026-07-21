-- Family sharing: the fleet owner invites members by email; members see and
-- edit the owner's fleet. Data stays owned by the owner's user_id.
-- Run in SQL Editor of project fxycfrtycqxdlhrpfeiv AFTER 0005.

create table if not exists public.fleet_members (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  member_email text not null,
  created_at timestamptz not null default now(),
  unique (owner_user_id, member_email)
);
alter table public.fleet_members enable row level security;
drop policy if exists "fleet_members_owner" on public.fleet_members;
create policy "fleet_members_owner" on public.fleet_members
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
drop policy if exists "fleet_members_self_view" on public.fleet_members;
create policy "fleet_members_self_view" on public.fleet_members
  for select using (lower(member_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- The set of user_ids whose fleet the current user can access:
-- themselves + any owner who invited their email.
create or replace function public.accessible_owner_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select auth.uid()
  union
  select owner_user_id from public.fleet_members
  where lower(member_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

-- Replace owner-only policies with membership-aware ones.
drop policy if exists "vehicles_owner" on public.vehicles;
create policy "vehicles_owner" on public.vehicles
  for all using (user_id in (select public.accessible_owner_ids()))
  with check (user_id in (select public.accessible_owner_ids()));
drop policy if exists "fuel_logs_owner" on public.fuel_logs;
create policy "fuel_logs_owner" on public.fuel_logs
  for all using (user_id in (select public.accessible_owner_ids()))
  with check (user_id in (select public.accessible_owner_ids()));
drop policy if exists "service_logs_owner" on public.service_logs;
create policy "service_logs_owner" on public.service_logs
  for all using (user_id in (select public.accessible_owner_ids()))
  with check (user_id in (select public.accessible_owner_ids()));
drop policy if exists "maintenance_items_owner" on public.maintenance_items;
create policy "maintenance_items_owner" on public.maintenance_items
  for all using (user_id in (select public.accessible_owner_ids()))
  with check (user_id in (select public.accessible_owner_ids()));
drop policy if exists "fixed_costs_owner" on public.fixed_costs;
create policy "fixed_costs_owner" on public.fixed_costs
  for all using (user_id in (select public.accessible_owner_ids()))
  with check (user_id in (select public.accessible_owner_ids()));
drop policy if exists "receipts_owner" on public.receipts;
create policy "receipts_owner" on public.receipts
  for all using (user_id in (select public.accessible_owner_ids()))
  with check (user_id in (select public.accessible_owner_ids()));
drop policy if exists "vehicle_photos_owner" on public.vehicle_photos;
create policy "vehicle_photos_owner" on public.vehicle_photos
  for all using (user_id in (select public.accessible_owner_ids()))
  with check (user_id in (select public.accessible_owner_ids()));

-- Storage: members can read/write files under any accessible owner's folder
-- (uploads still land under the uploader's own folder).
drop policy if exists "receipts_storage_owner" on storage.objects;
create policy "receipts_storage_owner" on storage.objects
  for all using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] in (select id::text from public.accessible_owner_ids() as id)
  ) with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] in (select id::text from public.accessible_owner_ids() as id)
  );
drop policy if exists "vehicle_photos_storage_owner" on storage.objects;
create policy "vehicle_photos_storage_owner" on storage.objects
  for all using (
    bucket_id = 'vehicle-photos'
    and (storage.foldername(name))[1] in (select id::text from public.accessible_owner_ids() as id)
  ) with check (
    bucket_id = 'vehicle-photos'
    and (storage.foldername(name))[1] in (select id::text from public.accessible_owner_ids() as id)
  );
