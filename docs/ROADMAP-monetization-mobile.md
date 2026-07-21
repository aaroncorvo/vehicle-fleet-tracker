# MotorLog — Monetization & Mobile Roadmap

Synthesized 2026-07-21 from two research passes (full reports in this folder:
`research-subscriptions.md`, `research-app-stores.md`). Decisions below are the
recommended path; sources and alternatives live in the reports.

## The decision stack

| Decision | Pick | Why (one line) |
|---|---|---|
| Payment provider | **Stripe Billing + Stripe Tax** | Best Supabase tooling; only web rail RevenueCat unifies with store IAP; MoR fees (5%+) buy tax handling we don't need at US-first scale |
| Store-payments strategy | **Web-first billing; apps ship free, login-only** | Compliant everywhere forever; US storefronts additionally allow "Manage subscription" web links (0% Apple commission as of now — litigation may change it, in which case remove the button, zero backend change) |
| Entitlement layer | **`subscriptions` table + `effective_tier()` in Postgres** | Fleet owner = billing unit; drops straight onto `fleet_members`/`accessible_owner_ids()`; RevenueCat added only if/when native IAP is wanted |
| Mobile packaging | **Capacitor 8 wrapper** | App is already phone-shaped; RN rewrite buys nothing; PWA-only impossible for OBD-II on iOS (no Web Bluetooth in Safari) |
| OTA updates | **Skip at first; Capgo self-hosted if needed** | Appflow is EOL; Apple review is 1–3 days at this scale |
| OBD-II hardware | **BLE dongles only** (Vgate iCar Pro BLE, OBDLink CX, Veepeak BLE+) | iPhone can't use Bluetooth-Classic ELM327s; BLE plugin also runs in desktop Chrome for dev |

## Tiers & pricing (annual only)

| Tier | Price | Limits | Features |
|---|---|---|---|
| Free | $0 | 2 vehicles, no members | core logging |
| Individual | $24/yr | 5 vehicles | + OCR, Drive backup |
| Family | $48/yr | 10 vehicles, 5 members | everything |
| Commercial | $180/yr | 15 vehicles, 15 seats (+$12/veh/yr over) | + CSV/API export |

Market context: consumer apps (Drivvo $5.99/yr) vs fleet SaaS (AUTOsist/Fleetio
$240+/yr floors) — MotorLog sits in the empty middle. Same prices on every
platform if IAP is ever added (eat the 15% Small Business rate).

Commercial v1 = bigger caps on the existing one-fleet-per-owner model.
True multi-fleet (a `fleets` table + `fleet_id` everywhere) is explicitly out
of scope until a real customer demands it.

## Phase plan

### Phase 0 — now, while free (no Stripe account needed)
1. Migration `0012_billing.sql`: `plan_limits`, `billing_customers`,
   `subscriptions` (service-role-write-only, like `google_drive_connections`),
   `effective_tier()` + `owner_can_write()` resolvers, insert-time limit
   triggers on `vehicles` and `fleet_members`. Seed the family's own account
   with `provider='comp', tier='family'`, far-future period end.
2. App: load `effective_tier` at session start; limit-aware UI (grey
   "Add vehicle"/"Invite" at cap); stub Plan panel in Settings.
3. Tier checks inside `ocr-receipt` and `google-drive` edge functions.
4. Lapsed accounts NEVER lose read access — they degrade to free-tier write
   limits. No data hostage.

### Phase 1 — web subscription launch
1. Stripe: products/prices ×3, Stripe Tax on, Texas sales-tax permit
   (TX taxes SaaS as data processing @80% of charge).
2. Edge functions: `create-checkout`, `create-portal-session`,
   `stripe-webhook` (signature-verified, Verify-JWT OFF, service-role upserts
   into `subscriptions` keyed on `provider_subscription_id`).
3. pg_cron daily expiry sweep (14-day grace on annual) + dunning/renewal
   emails through the existing `alerts`/Resend pattern.
4. Pricing page; re-enable public signups WITH email confirmation
   (member matching trusts JWT emails); ToS + Privacy Policy pages
   (Stripe and both stores require them).

### Phase 2 — app stores (parallel track; start the clocks early)
1. **Immediately**: Apple Developer enrollment ($99/yr) and Google Play
   Console ($25). Play personal accounts require a 12-tester ×
   14-consecutive-day closed test before production — the long pole
   (4–6 weeks calendar). iOS ≈ 2–3 weeks.
2. Capacitor 8 scaffold (`com.aaroncorvo.motorlog`), icons/splash from PWA
   assets, commit `ios/` + `android/`.
3. Three code changes:
   - NHTSA base URL: CapacitorHttp native fetch → `https://api.nhtsa.gov`
     directly when `Capacitor.isNativePlatform()` (no Netlify proxy natively).
   - Supabase auth storage → `@capacitor/preferences` adapter (~15 lines).
   - Google Drive OAuth → `@capacitor/browser` system browser + Universal/App
     Links (`https://motorlog.netlify.app/gdrive-callback` + AASA/assetlinks
     files on Netlify), handled via `appUrlOpen` listener. Fiddliest task
     (1–2 days).
4. Store compliance: privacy labels / Data Safety form, delete-account edge
   function (Play requirement), demo `review@` account with seeded data,
   `ITSAppUsesNonExemptEncryption=NO`.
5. Apple 4.2 (minimum functionality) mitigation: native camera receipt
   scanning at v1.0; OBD-II BLE as the marquee 1.1 (impossible in Safari =
   bulletproof native justification).
6. US-storefront-only "Manage subscription" links to the Stripe web portal;
   watch the Epic v. Apple remand — if link-out commissions return, remove
   the iOS button and stay login-only.
7. If store conversion later matters: RevenueCat (free < $2.5k MTR),
   `purchases-capacitor`, sibling `revenuecat-webhook` writing the same
   `subscriptions` table, `app_user_id` = Supabase user id, Apple Small
   Business Program (15%).

### Phase 3 — OBD-II (post-launch 1.1)
`@capacitor-community/bluetooth-le`; ELM327 AT-command framing + PID parsing
in `src/lib/obd.js` (1–3 weeks real engineering); BLE dongle ~$30–80 for
testing; `NSBluetoothAlwaysUsageDescription` required; no simulator BLE.

## Cost summary
One-time ~$55–105 (Play $25, dongle $30–80). Annual ~$99 (Apple) +
Stripe fees ~3.9%+30¢/txn. RevenueCat/Capgo $0 at this scale.
