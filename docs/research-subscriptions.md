# MotorLog Subscription & Licensing Architecture — Research Report

Research date: 2026-07-21. Codebase reviewed: migrations 0001–0011, `fleet_members`/`accessible_owner_ids()` (migration 0006), edge functions `ocr-receipt`, `google-drive`, `alerts`.

---

## 1. Payment provider recommendation: **Stripe Billing (+ Stripe Tax), with RevenueCat layered on when the Capacitor apps ship**

### The field, mid-2026

| Provider | Model | Fees (annual sub, US card) | Tax handling | Supabase fit |
|---|---|---|---|---|
| **Stripe Billing** | You are the merchant | 2.9% + $0.30, + 0.5% Billing (Starter), + 0.5% Stripe Tax ≈ 3.9% + $0.30 all-in | Stripe Tax *calculates*; you register/remit (small burden at low volume) | **Best in class** — official docs, `stripe-sync-engine`, many edge-function webhook templates |
| **Paddle** | Merchant of record | 5% + $0.50 | Fully handled (seller in 200+ jurisdictions) | Webhooks fine, no first-party Supabase tooling; hosted checkout only |
| **Lemon Squeezy** | MoR | 5% + $0.50 | Fully handled | Acquired by Stripe (2024), roadmap quiet, users funneled to **Stripe Managed Payments** — a forced migration |
| **Stripe Managed Payments** | MoR (Lemon-Squeezy-derived) | ~3.5% surcharge on top of standard ≈ 6.4% + $0.30 | Fully handled (75+ countries) | Gradual rollout mid-2026 |
| **Polar / Creem** | MoR | 4% + $0.40 / 3.9% | Fully handled | Young companies — platform risk |

### Why Stripe Billing wins for MotorLog

1. **The mobile future decides it.** The only web-billing rail RevenueCat natively unifies with App Store/Play entitlements is **Stripe**. Paddle/Lemon Squeezy would mean stitching two entitlement systems together forever.
2. **Supabase integration maturity.** Supabase's own docs and `supabase/stripe-sync-engine` target Stripe. The webhook→edge-function→Postgres pattern already used for OCR/Drive/alerts maps 1:1.
3. **Tax reality for a US solo dev.** MoR's main value is international VAT. At launch: tens of customers, mostly US. Economic-nexus thresholds are ~$100k/yr in most states — you owe only where you have physical nexus. **Texas taxes SaaS** (data processing at 80% of the charge) — register a $0 Texas permit and let Stripe Tax calculate. Bolt on an MoR later only if international revenue becomes material.
4. **Lemon Squeezy is the wrong 2026 bet** (mid-absorption, SMP ≈ 6.4% + $0.30). Paddle is the credible MoR runner-up if you never want to think about tax — the fallback, not the pick.

Sources: FintechSpecs MoR comparison 2026 (fintechspecs.com/blog/stripe-vs-paddle-vs-lemon-squeezy-vs-polar-merchant-of-record-b2b-saas), F3 micro-SaaS comparison (f3fundit.com/stripe-vs-paddle-vs-lemon-squeezy-micro-saas-2026), lemonsqueezy.com/blog/2026-update, stripe.com/managed-payments, dodopayments.com/blogs/stripe-managed-payments-fees-explained, devtoolpicks.com/blog/polar-vs-lemon-squeezy-vs-creem-2026

---

## 2. CRITICAL: App-store payment rules in 2026, and the compliant architecture

**Apple baseline (3.1.1):** if the app *offers* purchase of digital subscriptions in-app, it must use Apple IAP — 30%, or **15% via the Small Business Program** (<$1M/yr).

**Apple US storefront — the big change:** after the willful-contempt finding in Epic v. Apple (May 2025), Apple rewrote 3.1.1/3.1.3: **US-storefront apps may freely include buttons/links to web purchases — no entitlement, no scare screens, currently 0% Apple commission on those web purchases** (developer.apple.com/news/?id=9txfddzf; 9to5mac.com/2025/05/01/apple-app-store-guidelines-external-links). Status July 2026: Ninth Circuit largely upheld the injunction; April 2026 reversed Apple's stay attempt; remand before Judge Gonzalez Rogers on *whether Apple may charge any commission* on link-outs, Apple petitioning SCOTUS (macrumors.com 2026/04/29; appleinsider.com 26/05/21). **Risk to price in: a "reasonable" link-out fee could return.** Outside the US, old rules apply (IAP or regional regimes like EU DMA / External Purchase Link Entitlement).

**The evergreen loophole:** the "Netflix/Spotify" pattern (3.1.3(b) multiplatform services) — an app that **sells nothing in-app** and just lets users **log in to an account purchased elsewhere** has always been compliant; on the US storefront you may now also *tell* users where to buy.

**Google Play:** post-Epic-v.-Google (injunction survived appeal), US policy changed effective **Oct 29, 2025** (programs live Dec 9, 2025): **Play Billing no longer required for US users; alternative in-app payments and external links allowed**; fees roughly **9%–20%** under the new regime (support.google.com/googleplay/android-developer/answer/15582165). Epic and Google withdrew their proposed settlement July 15, 2026 — the original 2024 injunction governs; third-party stores get Play Catalog access July 22, 2026. Play is now the *less* restrictive store.

### Recommended compliant approach

**Web-first billing, apps as free companions:**
1. **All purchases on motorlog.netlify.app via Stripe Checkout.**
2. **Capacitor apps ship free, login-only**, unlocked by server-side entitlement (RLS already gates). Compliant everywhere, forever, regardless of litigation.
3. **US storefronts: "Manage subscription / Upgrade" buttons opening the Stripe web page** — permitted on iOS US (no entitlement) and Play US. Hide for non-US storefronts.
4. **Optionally later: native IAP via RevenueCat** (IAP converts better than link-out; 15% small-business rate; both rails feed one entitlement system).

Worst case (courts restore a link-out fee): remove the US iOS button, fall back to pure login-only — zero backend changes.

---

## 3. RevenueCat

**What:** SDK + backend wrapping StoreKit/Play Billing; validates receipts; normalizes App Store + Play + Amazon + **Stripe (web)** into one **customer → entitlements** model; webhooks on every lifecycle event.

**Pricing 2026:** free to **$2,500/mo tracked revenue**; then ~0.99% (Starter) / 1.2% (Pro). Free for a long time at launch scale ($2.5k MTR ≈ $30k ARR).

**Fit:** official `@revenuecat/purchases-capacitor`; Stripe subscriptions reportable so web+iOS+Android resolve to one entitlement per user (`app_user_id` = Supabase `user_id`); one RevenueCat webhook → one edge function → the same `subscriptions` table.

**Recommendation:** skip at web launch; adopt in the Capacitor phase only if offering native IAP.

---

## 4. Schema + entitlement design for this codebase

Principle: **the fleet owner (`owner_user_id`) is the billing unit** — data rows already carry the owner's `user_id`; members piggyback via `accessible_owner_ids()`. Members never pay.

### Migration `0012_billing.sql` (sketch)

```sql
create table public.plan_limits (
  tier text primary key,                 -- 'free' | 'individual' | 'family' | 'commercial'
  max_vehicles int not null,
  max_members  int not null,             -- fleet_members rows (owner not counted)
  features jsonb not null default '{}'
);
insert into plan_limits values
  ('free',       2,  0, '{"ocr": false, "drive_backup": false}'),
  ('individual', 5,  0, '{"ocr": true,  "drive_backup": true}'),
  ('family',    10,  5, '{"ocr": true,  "drive_backup": true}'),
  ('commercial',25, 15, '{"ocr": true,  "drive_backup": true, "csv_api": true}');

create table public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique not null,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'stripe',        -- 'stripe' | 'app_store' | 'play' | 'comp'
  provider_subscription_id text unique,
  tier text not null references public.plan_limits(tier),
  status text not null,                            -- 'trialing'|'active'|'past_due'|'canceled'|'expired'
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  grace_days int not null default 14,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.subscriptions (owner_user_id, status);

alter table public.billing_customers enable row level security;
alter table public.subscriptions enable row level security;
create policy "subs_owner_read" on public.subscriptions
  for select using (owner_user_id = auth.uid());
create policy "cust_owner_read" on public.billing_customers
  for select using (user_id = auth.uid());
-- no write policies → service-role-only writes (same pattern as google_drive_connections)

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

create or replace function public.owner_can_write(owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.effective_tier(owner) <> 'free'
      or not exists (select 1 from public.subscriptions where owner_user_id = owner)
$$;
```

### Enforcement (three layers, cheapest first)

1. **Client (UX only):** fetch `effective_tier` + `plan_limits` at session load in `App.jsx`; grey out "Add vehicle"/"Invite member"/OCR at limits; upgrade prompts. Cosmetic.
2. **Triggers (the real wall):** quantity limits as insert-time checks:

```sql
create or replace function public.check_vehicle_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare cap int;
begin
  select max_vehicles into cap from plan_limits
    where tier = public.effective_tier(new.user_id);
  if (select count(*) from vehicles
        where user_id = new.user_id and archived = false) >= cap then
    raise exception 'PLAN_LIMIT_VEHICLES' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger vehicles_plan_limit before insert on public.vehicles
  for each row execute function public.check_vehicle_limit();
-- identical trigger on fleet_members using max_members
```

   **Expiry never revokes read access** — lapsed users keep select on all their data and degrade to `free` write limits. For a harder write lock, extend the 0006 policies' `with check` with `and public.owner_can_write(user_id)` — one line per table since 0006 centralized them.
3. **Edge functions:** `ocr-receipt` and `google-drive` check `effective_tier` server-side (they receive the user JWT; one extra service-client query) so paid features can't be invoked directly by free accounts.

### Webhook flow (Stripe → Supabase)

```
Stripe Checkout (pricing page → create-checkout edge fn; customer keyed to auth.uid())
        │
events: checkout.session.completed, customer.subscription.created/updated/deleted,
        invoice.paid, invoice.payment_failed
        │
supabase/functions/stripe-webhook  (Verify JWT OFF — self-auths via
  stripe.webhooks.constructEvent + STRIPE_WEBHOOK_SECRET; google-drive pattern)
        │  service-role client
        ▼
upsert public.subscriptions on provider_subscription_id
  (price ID → tier map in the function; status/current_period_end from the event)
```

- **Grace/expiry:** Stripe Smart Retries covers card failures (`past_due` stays entitled); `effective_tier` adds `grace_days`; a pg_cron daily job flips over-grace rows to `expired` and sends "renewal failed / expiring in 7 days" via the `alerts`/Resend pattern.
- **RevenueCat later:** sibling `revenuecat-webhook` writes the same table with `provider='app_store'|'play'`; the resolver doesn't change.
- **Commercial multi-fleet: punt.** v1 = bigger caps on the one-fleet-per-owner model. True multi-fleet needs a `fleets` table + `fleet_id` on every row — only if a real customer demands it.

---

## 5. Pricing suggestions (market-anchored)

Comparables: Drivvo Pro $5.99/yr; Fuelio free; Simply Auto Platinum ~$25–30/yr; AUTOsist $5–6/vehicle/mo with 5-vehicle min ≈ $300/yr floor; Fleetio $4–10/vehicle/mo, 5-vehicle min ≈ $240–600/yr floor. There's a canyon between $6/yr consumer apps and $240+/yr fleet SaaS — MotorLog (OCR, TCO, family sharing, backup) sits in the empty middle.

| Tier | Price (annual only) | Included | Positioning |
|---|---|---|---|
| Free | $0 | 1 user, 2 vehicles, no OCR/backup | Funnel + grandfathered lapses |
| **Individual** | **$24/yr** | 1 user, 5 vehicles, OCR + backup | 4× Drivvo but with OCR/TCO — impulse-priced |
| **Family** | **$48/yr** | Owner + 5 members, 10 vehicles | ~one oil change; no consumer competitor has real shared fleets |
| **Commercial** | **$180/yr** (15 vehicles, 15 seats; +$12/vehicle/yr over) | + CSV/API export | 40–60% under AUTOsist/Fleetio floors — the "too small for Fleetio" segment |

Keep IAP prices identical if native IAP is added (eat the 15% as CAC).

---

## 6. Phased implementation checklist

**Phase 0 — now, while free:**
- [ ] Migration `0012_billing.sql` (tables, resolvers, triggers) + comp row for the family (`provider='comp'`, `tier='family'`, far-future period end)
- [ ] Client: `effective_tier` at session load, limit-aware UI, stub Plan panel in Settings
- [ ] Tier checks in `ocr-receipt` and `google-drive`
- [ ] Document: Commercial multi-fleet out of scope v1

**Phase 1 — web launch (Stripe):**
- [ ] Stripe account; 3 annual Products/Prices; Stripe Tax + Texas permit
- [ ] `create-checkout` + `create-portal-session` edge functions
- [ ] `stripe-webhook` (signature-verified, service-role upserts) + secrets
- [ ] pg_cron expiry sweep + Resend dunning emails
- [ ] Pricing page; re-enable public signups **with email confirmation** (invites match JWT emails); ToS + Privacy pages

**Phase 2 — app stores (parallel):**
- [ ] Login-only apps first
- [ ] US-storefront-gated "Manage subscription" web links
- [ ] Watch the Epic v. Apple remand; drop the iOS US button if link-out fees return
- [ ] If IAP warranted: RevenueCat + `purchases-capacitor` + `revenuecat-webhook`; Apple Small Business Program (15%)

### Key store-policy sources
- developer.apple.com/news/?id=9txfddzf · 9to5mac.com/2025/05/01/apple-app-store-guidelines-external-links
- macrumors.com/2026/04/29/epic-games-wins-reversal-app-store-fee-battle · appleinsider.com/articles/26/05/21 (SCOTUS petition)
- developer.apple.com/documentation/storekit/external-purchase
- support.google.com/googleplay/android-developer/answer/15582165 · 9to5google.com/2026/06/24 (rollout) · techtimes.com (settlement withdrawal, third-party stores July 22, 2026)
- costbench.com/software/subscription-billing/revenuecat · revenuecat.com/blog/engineering/app-to-web-purchase-guidelines
- drivvo.com/en/pricing · autosist.com/pricing · capterra.com/p/120855/Fleetio
