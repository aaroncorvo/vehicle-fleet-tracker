-- Vehicle profiles: profile fields on vehicles + photo gallery.
-- Run in SQL Editor of project fxycfrtycqxdlhrpfeiv AFTER 0003.

alter table public.vehicles
  add column if not exists primary_driver text,
  add column if not exists plate text,
  add column if not exists color text,
  add column if not exists purchase_date date,
  add column if not exists purchase_price numeric(10,2),
  add column if not exists notes text;          -- quick-reference specs: capacities, filter PNs, torque

create table if not exists public.vehicle_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  file_path text not null,           -- storage path in the 'vehicle-photos' bucket
  caption text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists vehicle_photos_vehicle on public.vehicle_photos (vehicle_id, created_at);

alter table public.vehicle_photos enable row level security;
drop policy if exists "vehicle_photos_owner" on public.vehicle_photos;
create policy "vehicle_photos_owner" on public.vehicle_photos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
  values ('vehicle-photos', 'vehicle-photos', false)
  on conflict (id) do nothing;

drop policy if exists "vehicle_photos_storage_owner" on storage.objects;
create policy "vehicle_photos_storage_owner" on storage.objects
  for all using (
    bucket_id = 'vehicle-photos' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'vehicle-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
