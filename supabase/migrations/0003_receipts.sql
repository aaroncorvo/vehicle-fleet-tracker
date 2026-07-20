-- Receipts: uploaded receipt files (Storage) + extracted metadata, linked to
-- service logs. OCR extraction happens in the ocr-receipt edge function.
-- Run in SQL Editor of project fxycfrtycqxdlhrpfeiv AFTER 0002.

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  service_log_id uuid references public.service_logs(id) on delete set null,
  file_path text not null,           -- storage path in the 'receipts' bucket
  vendor text,
  receipt_date date,
  total numeric(10,2),
  odometer int,
  extracted jsonb,                   -- full OCR extraction payload
  created_at timestamptz not null default now()
);
create index if not exists receipts_vehicle on public.receipts (vehicle_id, receipt_date);

alter table public.receipts enable row level security;
drop policy if exists "receipts_owner" on public.receipts;
create policy "receipts_owner" on public.receipts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Private storage bucket; files live under <user_id>/... so the folder-prefix
-- policy scopes every operation to the owner.
insert into storage.buckets (id, name, public)
  values ('receipts', 'receipts', false)
  on conflict (id) do nothing;

drop policy if exists "receipts_storage_owner" on storage.objects;
create policy "receipts_storage_owner" on storage.objects
  for all using (
    bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text
  );
