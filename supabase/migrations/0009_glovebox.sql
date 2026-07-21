-- Glovebox: driver/vehicle documents (insurance card, registration, roadside).
-- Run in SQL Editor of project fxycfrtycqxdlhrpfeiv AFTER 0008.

create table if not exists public.driver_docs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  holder text not null,                     -- whose document: "Aaron", "Kary"
  kind text not null default 'Insurance Card',
  label text,                               -- e.g. "State Farm policy 84-XX"
  vehicle_id uuid references public.vehicles(id) on delete set null,  -- null = fleet-wide
  expires_on date,
  file_path text not null,                  -- storage path in 'documents' bucket
  created_at timestamptz not null default now()
);
create index if not exists driver_docs_vehicle on public.driver_docs (vehicle_id);

alter table public.driver_docs enable row level security;
drop policy if exists "driver_docs_owner" on public.driver_docs;
create policy "driver_docs_owner" on public.driver_docs
  for all using (user_id in (select public.accessible_owner_ids()))
  with check (user_id in (select public.accessible_owner_ids()));

insert into storage.buckets (id, name, public)
  values ('documents', 'documents', false)
  on conflict (id) do nothing;

drop policy if exists "documents_storage_owner" on storage.objects;
create policy "documents_storage_owner" on storage.objects
  for all using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in (select id::text from public.accessible_owner_ids() as id)
  ) with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in (select id::text from public.accessible_owner_ids() as id)
  );
