-- Tire pressure on fill-ups + daily email alert infrastructure.
-- Run in SQL Editor of project fxycfrtycqxdlhrpfeiv AFTER 0007.

alter table public.fuel_logs
  add column if not exists tire_psi jsonb;   -- {"fl":36,"fr":36,"rl":38,"rr":38}

-- Tracks the last digest sent per fleet owner so unchanged digests aren't resent.
create table if not exists public.alert_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_hash text,
  last_sent_at timestamptz
);
alter table public.alert_state enable row level security;  -- no policies: service-role only

-- Daily alert check at 13:00 UTC (8:00 AM Central) via the `alerts` edge function.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'motorlog-alerts') then
    perform cron.unschedule('motorlog-alerts');
  end if;
end $$;

select cron.schedule(
  'motorlog-alerts',
  '0 13 * * *',
  $$
  select net.http_post(
    url := 'https://fxycfrtycqxdlhrpfeiv.supabase.co/functions/v1/alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'ca3b6ffaf0dd5dad94b842de207828e36d1bb18faec200d9'
    ),
    body := '{"action":"run-all"}'::jsonb
  )
  $$
);
