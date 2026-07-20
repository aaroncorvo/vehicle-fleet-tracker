# /// FLEET — Fuel & Maintenance Tracker

Personal Fuelly replacement plus maintenance-interval tracking for a 4-vehicle Toyota/Lexus fleet:
2015 GX460 · 2017 IS350 F-Sport · 2004 GX470 · 1991 Land Cruiser FJ80 "Ghost".

## Stack

- **Frontend:** Vite + React, deployed on Netlify
- **Backend:** Supabase (Postgres + Auth + RLS)
- **Auth:** Email/password, single-user. All tables row-level-secured to `auth.uid()`.

## Features

- **Fuel log** — Fuelly-style fill tracking with full/partial/reset fill types.
  MPG computed with proper partial-fill accumulation. Auto-derives the third value
  from any two of gallons / $/gal / total.
- **Service log** — service history with parts, cost, shop. Logging a service can
  automatically roll the matching maintenance interval's baseline forward.
- **Maintenance intervals** — mileage- and/or time-based intervals per vehicle with
  overdue / due-soon / ok status computed against the highest odometer reading seen.
  Includes KDSS fluid inspection for the GX460.
- **Dashboard** — per-vehicle gauges: odometer, aggregate MPG, fuel cost/mile,
  estimated annual fuel spend (annualized from actual logging cadence).
- **Data** — CSV export of all tables; Fuelly CSV import with duplicate detection.

## Environment variables (set in Netlify)

| Var | Value |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_KEY` | Supabase publishable (anon) key |

## Database

Schema lives in `supabase/migrations/0001_init.sql`. Tables: `vehicles`, `fuel_logs`,
`service_logs`, `maintenance_items`. All RLS-protected owner-only.

## Local development

```bash
npm install
VITE_SUPABASE_URL=... VITE_SUPABASE_KEY=... npm run dev
```

## First run

1. Create your account on the login screen.
2. **Then disable new signups**: Supabase Dashboard → Authentication → Sign In / Up →
   toggle "Allow new users to sign up" off. You're the only account; nobody else can register.
3. Tap **Load My Fleet** to seed the four vehicles, fuel history, and maintenance intervals.

## MPG methodology

- `reset` rows establish an odometer baseline (first fill, or after missed fills).
- `partial` rows accumulate gallons; MPG defers to the next full fill.
- `full` rows compute MPG = miles since last full ÷ (accumulated + this fill's gallons).

This matches Fuelly's methodology, so imported history computes identical figures.
