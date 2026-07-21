# CLAUDE.md — MotorLog (vehicle fleet tracker)

Project context for Claude Code. Read this fully before making changes.

## What this is

A personal Fuelly-replacement + maintenance tracker for a 4-vehicle Toyota/Lexus fleet,
built for one user (Aaron, Round Rock TX, drives 27–35k mi/yr — total-cost-of-ownership
is the lens for every feature decision):

| Vehicle | VIN | Engine | Notes |
|---|---|---|---|
| 2015 Lexus GX460 | JTJBM7FX6F5091083 | 1UR-FE 4.6L V8 | Daily driver, KDSS, overland build in progress, ~91k mi |
| 2017 Lexus IS350 F-Sport | JTHBE1D23H5030666 | 2GR-FSE 3.5L V6 | |
| 2004 Lexus GX470 | JTJBT20XX40058872 | 2UZ-FE 4.7L V8 | 275k+ mi, OEM oil filter ONLY (no WIX 51515) |
| 1991 Toyota Land Cruiser FJ80 "Ghost" | JT3FJ80WXM0034788 | 3F-E 4.0L I6 | Secondary rig, ~286k mi |

## Stack & live endpoints

- **Frontend:** Vite + React 18, no router (tab state), no UI framework — hand-rolled CSS design system
- **Hosting:** Netlify — site `motorlog`, siteId `6ff87f52-dc66-4b89-8ab8-b05fb9788a4a`
  - Live: https://motorlog.netlify.app
- **Backend:** Supabase — project ref `fxycfrtycqxdlhrpfeiv` (user's PERSONAL account)
  - URL: https://fxycfrtycqxdlhrpfeiv.supabase.co
  - Auth: email/password, single user. After the owner registered, public signups should be
    disabled in dashboard (Authentication → Sign In / Providers → "Allow new users to sign up" OFF). Verify.
- **Env vars** (set in Netlify, builds scope, also needed for local dev):
  - `VITE_SUPABASE_URL` = https://fxycfrtycqxdlhrpfeiv.supabase.co
  - `VITE_SUPABASE_KEY` = the publishable key (client-safe; find in Supabase dashboard → Settings → API)

## ⚠️ CRITICAL WARNINGS — read before touching infrastructure

1. **Supabase account confusion hazard.** The user has access to MULTIPLE Supabase accounts.
   An earlier session created a project in the WRONG org ("BlackOrchid" Pro, org
   `ifamsskrqvbldremdssm`, project `dtztfigimyvpnzbqqwzw`) costing $10/mo. It should be
   deleted — verify it's gone; if not, remind the user (deletion is dashboard-only).
   **NEVER create Supabase projects without confirming the target org and cost with the user first.**
   The correct project for this app is `fxycfrtycqxdlhrpfeiv` on the personal account.
2. **Netlify MCP deploy bug.** The `deploy-site` MCP operation emits an npx command whose
   proxy URL contains a double slash (`netlify-mcp.netlify.app//proxy/...`) which 404s.
   Workaround that works: take the proxy URL, fix to single slash, then
   `curl -X POST "$PROXY/api/v1/sites/$SITE_ID/builds" -F "zip=@source.zip;type=application/zip"`
   with a zip of the SOURCE (exclude node_modules, dist, .git). Poll
   `$PROXY/api/v1/deploys/$DEPLOY_ID`. Proxy tokens are short-lived — use immediately.
   Only `/builds` and `/deploys/{id}` paths are whitelisted on the proxy.
   (Once the repo is linked to GitHub in the Netlify dashboard, git push auto-deploys and
   this workaround becomes unnecessary.)
3. **The publishable key cannot run DDL.** Schema changes go through the Supabase SQL Editor
   (user pastes) or the Supabase MCP/CLI if authenticated to the personal account.
4. **Never bake the service_role key into the frontend.** Publishable key only.

## Current state (as of 2026-07-20, evening)

- ✅ App deployed and serving at motorlog.netlify.app
- ✅ Auth works; user has an account
- ✅ Schema `0001_init.sql` applied to `fxycfrtycqxdlhrpfeiv` (verified via REST probe)
- ✅ Repo on GitHub: https://github.com/aaroncorvo/vehicle-fleet-tracker (branch `main`),
  linked to Netlify → push auto-deploys. GitHub Actions CI runs `npm test` + `npm run build`.
- ✅ `npm test` — vitest regression suite for calc.js (21 tests incl. the verified GX460 values)
- ✅ TCO rollup screen (TCO tab) + `fixed_costs` table
- ⏳ **Migration `0002_fixed_costs.sql` must be pasted in the SQL Editor** — until then the
  TCO tab shows a run-migration hint (app handles the missing table gracefully).
- ✅ Receipt scan/upload feature (Service tab): upload photo/PDF → Supabase Storage
  (`receipts` bucket) + OCR via `ocr-receipt` edge function (Claude claude-haiku-4-5,
  vision + structured outputs) → pre-fills the service form → saves linked `receipts` row.
- ⏳ **Receipt feature needs one-time setup**: (1) paste `0003_receipts.sql` in SQL Editor;
  (2) deploy `supabase/functions/ocr-receipt/index.ts` (dashboard → Edge Functions →
  Deploy new function, name `ocr-receipt`, keep Verify JWT ON); (3) set `ANTHROPIC_API_KEY`
  secret (Edge Functions → Secrets). Until then the Service tab shows a setup hint.
- ✅ Migrations 0002 (fixed_costs) and 0003 (receipts + bucket) applied; ocr-receipt edge
  function deployed with ANTHROPIC_API_KEY secret set. Verified via REST probe.
- ✅ Vehicle profiles (Fleet tab → tap a card): photo gallery (`vehicle-photos` bucket +
  `vehicle_photos` table), primary driver / plate / color / purchase info / specs notes.
- ⏳ **Migration `0004_vehicle_profiles.sql` must be pasted in the SQL Editor** — until then
  the detail view shows a setup hint for photos and profile saves fail on new columns.
- ⏳ Local dev note: `.env` does not exist yet in the working copy — without it,
  `npm run build` statically compiles to the config-missing screen (tiny bundle, no app).
  Netlify has the env vars, so deploys are unaffected.
- ✅ Google Drive backup feature (Data tab): "Connect Google Drive" OAuth (drive.file scope,
  embedded consent flow) + BACKUP NOW button + nightly pg_cron backup (7:00 UTC) via the
  `google-drive` edge function. Tokens live server-side in `google_drive_connections`
  (RLS on, NO policies — service-role only).
- ⏳ **Drive backup setup pending**: (1) run migration 0005; (2) deploy
  `supabase/functions/google-drive/index.ts` with JWT verification **OFF** (it self-auths:
  user JWT or x-cron-secret); (3) secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
  GDRIVE_CRON_SECRET (value must match the one baked into migration 0005); (4) user creates
  the Google OAuth client (Web app, redirect URI exactly https://motorlog.netlify.app/,
  consent screen published to Production so refresh tokens don't expire weekly).
- ⏳ Signups may still be open — check and disable in dashboard (owner account exists).
- ⏳ The misplaced BlackOrchid project `dtztfigimyvpnzbqqwzw` (empty, $10/mo) still needs
  dashboard deletion.
- Local dev: repo lives at `~/Documents/Personal/Cars/FleetTracker/vehicle-fleet-tracker`;
  `.env` has the VITE_ vars (gitignored). Supabase MCP in Claude Code is authenticated to
  BlackOrchid only — it CANNOT touch the personal project; schema changes go via SQL Editor.

## Repo map

```
src/
  App.jsx                    # shell: auth gate, session, data fetch, tab nav, toast
  main.jsx
  styles.css                 # ENTIRE design system — see Design section
  lib/
    supabase.js              # client init from VITE_ env vars
    calc.js                  # ★ MPG engine, fuelStats, maintenanceStatus, tco, fmt
    seed.js                  # fleet seed data: 4 vehicles, 7 fuel entries, 27 maintenance items
  components/
    Dashboard.jsx            # per-vehicle gauge cards + fleet totals + maintenance flags
    FuelScreen.jsx           # fill entry form (auto-derives 3rd of gal/$gal/total) + history
    ServiceScreen.jsx        # service log; matching service auto-rolls maintenance baseline
    MaintenanceScreen.jsx    # interval status list, add/edit items, "mark done today"
    DataScreen.jsx           # CSV export ×3, Fuelly CSV import (dupe-skip), vehicle list
supabase/migrations/0001_init.sql   # full schema: 4 tables, RLS owner-only policies
netlify.toml                 # build cmd + SPA redirect
```

## Data model (all tables RLS: `auth.uid() = user_id`, user_id defaults to auth.uid())

- `vehicles` — name, nickname, year/make/model, vin, engine, base_odometer, fuel_octane, sort_order, archived
- `fuel_logs` — vehicle_id, filled_at, odometer, fill_type ('full'|'partial'|'reset'), gallons,
  cost_per_gallon, total_cost, octane, brand, location, payment, notes
- `service_logs` — vehicle_id, serviced_at, odometer, service_type, parts, cost, shop, notes
- `maintenance_items` — vehicle_id, name, interval_miles, interval_months, last_done_miles,
  last_done_date, part_number, notes

## Domain logic that MUST NOT regress (src/lib/calc.js)

**MPG methodology (Fuelly-compatible):**
- `reset` rows set an odometer baseline, no MPG
- `partial` rows accumulate gallons, no MPG
- `full` rows: MPG = miles since last full ÷ (accumulated partial gallons + this fill)
- Entries processed sorted by odometer per vehicle

**Verified reference values** (GX460 real data — regression-test against these):
- Per-fill MPG sequence from the 6 seeded GX460 entries: null, 13.81, 12.96, 12.60, 15.06, 12.52
- Aggregate: 1061 mi / 78.351 gal = **13.54 MPG**; total spend $397.01; avg $4.150/gal; $0.306/mi
- A test harness exists conceptually in git history; recreate as `npm test` (see Roadmap)

**Maintenance status:** overdue if miles-remaining ≤0 OR days-remaining ≤0; due-soon if ≤1000 mi
or ≤30 days; baseline if no last_done set. Current odometer = max reading across vehicle
base_odometer, fuel_logs, service_logs.

**Current odometer** is never stored/updated directly — always derived.

## Design system (src/styles.css)

Instrument-cluster aesthetic. Do not genericize.
- Colors: bg #0A0A0B, panel #131315, amber #FFB000 (primary accent), green #3DDC84, red #FF4D4D
- Type: Barlow Condensed (display, uppercase, letterspaced) + IBM Plex Mono (all numerals/labels)
- Mobile-first, bottom tab nav, one-thumb forms, 16px inputs (prevents iOS zoom)
- Status dots glow (box-shadow) for overdue/due-soon
- NO Tailwind, NO component libraries — keep the hand-rolled system

## User preferences (matter for any UI/UX or copy decisions)

- Deep technical fluency — never dumb down part numbers, engine codes, torque specs
- TCO/cost-per-mile is the decision metric he cares about most
- Prefers dense information display over whitespace-heavy minimalism
- OEM-parts bias (Toyota part numbers are first-class data, keep `part_number` fields visible)

## Roadmap (prioritized, from planning discussion with user)

1. ~~**TCO rollup screen**~~ DONE — `TcoScreen.jsx` + `tcoRollup()`/`fixedCostsAnnual()` in
   calc.js + `0002_fixed_costs.sql` (pending SQL Editor paste).
2. ~~**`npm test`**~~ DONE — `src/lib/calc.test.js`, CI in `.github/workflows/ci.yml`.
3. **Maintenance forecast** — project due DATES from rolling miles/day rate (he drives
   ~2.5-3k mi/mo; convert mileage thresholds to calendar estimates).
4. **Tire tracking** — purchase date/mileage, rotation log by position, tread depth by corner,
   DOT date-code age flag (safety-critical on the '91 FJ80). New table.
5. **MPG trend flag** — alert when a tank drops meaningfully below vehicle rolling average
   (early symptom of dragging brake / clogged filter).
6. **PWA manifest + icons** — installable home-screen app; amber-on-black icon.
7. **Recall tracker** — table for NHTSA campaigns w/ status. GX460 has 3 open (Takata ×2,
   Denso fuel pump). NHTSA API: `https://api.nhtsa.gov/recalls/recallsByVehicle?make=X&model=Y&modelYear=Z`
8. **Charts** — MPG-over-time and $/mo spend sparklines (keep dependency-light; consider
   hand-rolled SVG to preserve aesthetic).
9. **Edit/delete for fuel & service rows** (currently insert-only from UI).
10. **Per-vehicle detail view** — VIN, plant, specs, filter part numbers quick-reference
    (data exists in seed notes; could add `vehicle_specs` JSON column).

## Dev workflow

```bash
npm install
VITE_SUPABASE_URL=https://fxycfrtycqxdlhrpfeiv.supabase.co \
VITE_SUPABASE_KEY=<publishable key> npm run dev
npm run build        # must pass before any deploy
```

Deploy: prefer GitHub → Netlify CI once linked. Manual fallback: the /builds curl workaround
in Warnings §2.

## Migration discipline

- New schema changes = NEW numbered file in `supabase/migrations/` (never edit 0001 after apply)
- Every migration idempotent-safe where possible; always RLS on new tables with owner-only policy
- After migration, verify via REST probe before shipping frontend code that depends on it
