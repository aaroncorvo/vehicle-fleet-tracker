-- Alert preferences: how often digests go out, and to whom.
-- Run in SQL Editor of project fxycfrtycqxdlhrpfeiv AFTER 0009.

create table if not exists public.alert_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  frequency text not null default 'weekly'
    check (frequency in ('off', 'urgent', 'daily', 'weekly', 'monthly')),
  recipients jsonb,        -- {"email": false} exclusions; null/missing = everyone
  updated_at timestamptz not null default now()
);

alter table public.alert_prefs enable row level security;
drop policy if exists "alert_prefs_view" on public.alert_prefs;
create policy "alert_prefs_view" on public.alert_prefs
  for select using (user_id in (select public.accessible_owner_ids()));
drop policy if exists "alert_prefs_owner_write" on public.alert_prefs;
create policy "alert_prefs_owner_write" on public.alert_prefs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
