# CLAUDE.md — Ghost Fleet Tracker

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
- **Hosting:** Netlify — site `ghost-fleet-tracker`, siteId `6ff87f52-dc66-4b89-8ab8-b05fb9788a4a`
  - Live: https://ghost-fleet-tracker.netlify.app
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

## Current state (as of 2026-07-20)

- ✅ App deployed and serving at ghost-fleet-tracker.netlify.app
- ✅ Auth works; user has an account
- ⏳ **Schema migration may not be applied yet** — `supabase/migrations/0001_init.sql` must be
  run in the SQL Editor of project `fxycfrtycqxdlhrpfeiv`. Verify with:
  `curl "https://fxycfrtycqxdlhrpfeiv.supabase.co/rest/v1/vehicles?select=id&limit=1" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"`
  → PGRST205 error means NOT applied; `[]` or rows means applied.
- ⏳ Seed data not yet loaded (blocked on schema). App's empty state shows "Load My Fleet"
  button which seeds from `src/lib/seed.js`.
- ⏳ Repo not yet pushed to GitHub (was handed off as a git bundle). After pushing, link the
  repo to the Netlify site for CI auto-deploys.
- ⏳ Signups may still be open — check and disable after confirming the owner's account works.

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

1. **TCO rollup screen** — fuel + service + fixed costs (insurance, registration, inspection)
   normalized to $/mile per vehicle; the "keep vs replace" number. Needs a `fixed_costs` table
   (vehicle_id, name, amount, period) + migration.
2. **`npm test`** — port the calc.js regression tests (values above) into vitest; add CI.
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
