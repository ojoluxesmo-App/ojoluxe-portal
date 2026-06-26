# CLAUDE.md — OJO Luxe Operations System

This file is the persistent project spec. Read it at the start of every session.
It is the source of truth for what we're building, in what order, and how.

---

## What we're building

OJO Luxe is a luxury ground-transportation cooperative in Los Angeles (est. 2025).
This repo (`ojoluxe-portal`) is the operations system. It grows into a set of
**connected apps that all share ONE Supabase backend**. Today 2 of them exist;
the rest are sequenced in the roadmap below.

Tagline: *"Time is the ultimate luxury."*

---

## Guiding goals (read before planning any work)

1. **Stabilize the foundation before building anything new.** The admin portal
   and job share link must be rock-solid first. Nothing new ships on a shaky base.
2. **One data model, shared by every app.** All apps read/write the same Supabase
   tables, so we lock the data shape early and build each new layer on a stable
   one below it.
3. **Money fields get defined early.** Square payments + reporting define the
   fields the client, affiliate, and finance apps all depend on. Lock them before
   those apps.
4. **Always keep a working deploy.** Small surgical changes, commit + deploy after
   each, so there is always a working fallback.
5. **Build in the priority order in the roadmap.** Don't jump ahead to a later
   app while an earlier phase is unfinished.

---

## Current state (2 files, live)

- **`index.html`** — admin / dispatch portal: create & price jobs, assign drivers,
  manage fleet & team, quick quotes, waybills, Excel timesheet exports, tour-day
  logs, cancel/void flows. (~7,000 lines — read it in sections, never all at once.)
- **`job.html`** — driver share-link page: a dispatcher sends a temp/farm-out
  driver a URL with `?token`; the driver sees only their job, checks in (selfie +
  vehicle photos uploaded to Supabase Storage), updates status, and sees net pay.
  **No login — the token IS the access.**

`quote.html` (public quote intake) is planned, not yet live — see Phase 2. Its
backing table (`quote_requests`) already exists.

---

## Stack

- Plain HTML / CSS / JS, single files (one app per `.html`)
- Custom lightweight Supabase REST client (raw `fetch`, **NOT** the official SDK)
- SheetJS for Excel export
- Deployed **GitHub → Vercel** (each `.html` is its own page)
- **Node.js is NOT installed locally.** Never run `npm`/`node`, never run a build
  step or syntax checker. All work is plain files edited directly.
- Terminal is **Git Bash** (not PowerShell). Project path:
  `/c/Users/ojolu/Desktop/ojoluxe-portal`

---

## Supabase backend

- Project URL: `https://aadlqagpxwshpdccxwto.supabase.co`
- Auth posture for now: anon key, RLS off / full anon access (ship-fast).
  **See the security-debt note below — this must change by Phase 4.**

**Tables**
- `jobs` — key columns: `assigned_driver` (⚠️ a NAME string, NOT an ID),
  `status`, `reference_code`, `date`, `pickup_time`, `pickup_from`, `to`,
  `miles`, `hours`, `payment_status`, `share_token`, `booking_mode`,
  `outside_driver` (JSONB), `extras` (JSONB: status logs, driver check-in data,
  photo URLs, tour_day_log). Square will add `square_invoice_id` /
  `square_invoice_url`.
- `team_members` — `full_name`, `role`, `is_partner` (equity flag), `phone`,
  `email`, `dob`, `dl_number`, `driver_license_expiry`, `address`, `notes`
- `team_vehicles`
- `quote_requests` — backs the planned public quote form (`quote.html`). Holds
  client-submitted enquiry data for admin to review and convert into a job.
  (Confirm exact columns live with supabase-ops before building against it.)

**Storage buckets**
- `driver-photos` (anon upload, public read), `team-photos`, `ojo-docs`

**Job status flow**
`Offer → Assigned → Accepted → Heading to Pickup → Arrived → In Progress →
Completed / Cancelled` (plus `Voided`)

### ⚠️ Security debt (must be addressed by Phase 4, ideally sooner)

`team_members` holds real PII — `dl_number`, `dob`, `address`,
`driver_license_expiry`, phone, email — and Square will add payment data, all
behind the **public anon key with RLS off**. The anon key lives in front-end JS,
which anyone can view, so **today this data is effectively readable by anyone who
inspects the site.** That was an acceptable trade-off while the only data was
operational job info. It stops being acceptable once real driver auth (Phase 4)
and live payments (Phase 3) land.

Rule: treat the anon key as public, never assume any table is private, and
**enabling RLS + tightening access is a hard requirement before the driver app
(Phase 4) ships.** Pull it forward alongside Square (Phase 3) if possible.

---

## Pricing logic

- Point-to-point base fare covers the first **10 miles**
- Overtime is a **flat $75/hr** (not a multiplier)
- OJO takes a **10% commission**; drivers see net pay only
- Vehicle types: Mini Van, Premium Sedan, Cadillac Escalade, Chevrolet Suburban,
  Premium SUV, Sprinter
- Addresses: `PLACE_SHORTCUTS` hardcoded shortcuts + Nominatim fallback

---

## ROADMAP — build order (step by step)

Sequenced by **priority + data dependency**. Each phase lists what "done" means.
Do not start a phase until the one before it meets its done-criteria.

### PHASE 1 (NOW) — Stabilize `index.html` + `job.html`
The foundation. No new apps until this is solid.
**Done when:**
- Job lifecycle runs clean end-to-end (see status flow)
- Dispatch + reassignment reliable
- Driver check-in photo upload reliable
- Pay math correct (base + OT flat $75/hr + 10% commission)
- `job.html` solid on mobile

### PHASE 2 — Client quote form (`quote.html`)
Public intake page → writes to `quote_requests` → admin reviews in the portal and
converts an enquiry into a job. Sequenced here because it feeds the top of the
funnel, is low-risk, and its data model is simple and standalone.
**Done when:**
- Public can submit a quote enquiry; it lands in `quote_requests`
- Admin can see enquiries and turn one into a real job in `index.html`
- Mobile-friendly and on-brand

### PHASE 3 — Square invoicing automation (+ OT & reporting)
Defines the **money fields** every later app depends on, so it is locked early.
- Square: payment link / invoice from a job card, tipping, card-on-file, and a
  **webhook that sets `payment_status` to Paid** (webhook signature MUST be
  verified). Credentials live only in the Vercel serverless function.
- Reporting: job card shows base + OT subtotal + grand total; single-job Excel
  export and date-range / driver batch export (XLSX/PDF) for payroll + invoicing.
**Done when:**
- An admin can invoice a job through Square and see it auto-mark Paid
- OT is reflected in driver pay and stored in `extras.tour_day_log`
- Batch export produces correct payroll + client-invoice files

### PHASE 4 — Driver app (`driver.html`, authenticated)
Internal driver app: email/phone OTP login, **admin approval required**, each
driver sees only their own assigned jobs, with check-in / status / pay. Keep
`job.html` as-is for temp / farm-out drivers.
**Security gate:** real accounts + PII access means **RLS hardening is mandatory
here** (see security-debt note). This phase does not ship with RLS off.
**Done when:**
- OTP login + admin approval works
- A logged-in driver sees only their own jobs
- RLS enforced so drivers/clients cannot read others' data or PII

### PHASE 5 — Client app
Clients view their bookings, live status, and invoices / receipts.
Depends on Phase 3 payment data.
**Done when:**
- A client can log in and see only their bookings, statuses, and receipts

### PHASE 6 — Affiliate app
Affiliates / agents refer & book and track commissions. Needs the full
booking → payment chain plus a commission / attribution layer.
**Done when:**
- An affiliate can refer/book and see accurate commission attribution

### PHASE 7 — Fleet management portal (later, optional)
Deeper vehicle lifecycle than current `team_vehicles`: maintenance, availability,
assignment, documents/expiry. Build only once the booking → payment → driver
chain is stable.

### PHASE 8 — Finance
Consolidated finance layer: payouts, commissions, partner equity distributions,
P&L. Built last — it sits on top of payments (Phase 3), reporting, and affiliate
data.

---

## How to work (dev rules)

- **Read the actual file before writing any code.**
- **Always show a plan and wait for approval before making changes.**
- **Small surgical edits only** — never rebuild a whole file without explicit OK.
- **One change per commit.** After each change, commit + deploy so there's always
  a working fallback.
- **No Node** — never run `npm`/`node` or any syntax check; edit files directly.
- `index.html` is ~7,000 lines — read it in sections, never all at once.
- Build in roadmap order; don't jump ahead to a later phase.

---

## Brand kit

- Colors: black `#0C0B09`, gold `#C9A84C`, cream `#F0E8D5`
- Fonts: Cormorant Garamond (headings) + Space Grotesk (body)
