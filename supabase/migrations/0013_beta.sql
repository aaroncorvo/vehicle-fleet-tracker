-- 0013: beta program — every signup during beta gets a comped Family plan
-- until the beta end date, and an in-app feedback channel.

-- Auto-comp new users through the beta window
create or replace function public.beta_comp_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if now() < timestamptz '2027-01-01' then
    insert into public.subscriptions
        (owner_user_id, provider, provider_subscription_id, tier, status,
         current_period_end, grace_days)
    values (new.id, 'comp', 'beta-' || new.id, 'family', 'active',
            timestamptz '2027-01-01', 14)
    on conflict (provider_subscription_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists beta_comp on auth.users;
create trigger beta_comp after insert on auth.users
  for each row execute function public.beta_comp_new_user();

-- Feedback: testers write, only the service role (you, via SQL editor) reads
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  email text,
  message text not null,
  context jsonb,
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
drop policy if exists "feedback_insert_own" on public.feedback;
create policy "feedback_insert_own" on public.feedback
  for insert to authenticated with check (user_id = auth.uid());
-- no select policy: service-role read only
