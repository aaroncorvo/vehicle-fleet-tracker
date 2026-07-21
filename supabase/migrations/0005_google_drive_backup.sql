-- Google Drive backup: per-user Drive connection (OAuth refresh token) +
-- daily scheduled backup via pg_cron -> google-drive edge function.
-- Run in SQL Editor of project fxycfrtycqxdlhrpfeiv AFTER 0004.

create table if not exists public.google_drive_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_email text,
  refresh_token text not null,       -- server-side only; no client RLS policies
  folder_id text not null,
  folder_name text not null default 'Fleet Records',
  last_backup_at timestamptz,
  last_backup_result text,
  created_at timestamptz not null default now()
);
-- RLS on with NO policies: the anon/publishable key can never read tokens.
-- Only the service role (edge functions) touches this table.
alter table public.google_drive_connections enable row level security;

-- Daily auto-backup at 07:00 UTC (2:00 AM Central) via pg_cron + pg_net.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'fleet-drive-backup') then
    perform cron.unschedule('fleet-drive-backup');
  end if;
end $$;

select cron.schedule(
  'fleet-drive-backup',
  '0 7 * * *',
  $$
  select net.http_post(
    url := 'https://fxycfrtycqxdlhrpfeiv.supabase.co/functions/v1/google-drive',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'ca3b6ffaf0dd5dad94b842de207828e36d1bb18faec200d9'
    ),
    body := '{"action":"backup-all"}'::jsonb
  )
  $$
);
