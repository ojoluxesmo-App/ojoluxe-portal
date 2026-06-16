# OJO Luxe Operations System — CLAUDE.md

## WHAT WE'RE BUILDING
OJO Luxe is a luxury ground-transportation cooperative in LA. This repo
(ojoluxe-portal) is our operations system. It will eventually be 5 connected
apps that all share ONE Supabase backend. Right now 2 of the 5 exist.

---

## CURRENT STATE (2 files, live)
- `index.html` — admin/dispatch portal: create & price jobs, assign drivers,
  manage fleet & team, quick quotes, waybills, Excel timesheet exports,
  tour-day logs, cancel/void flows. (~7,000 lines)
- `job.html` — driver share-link page: dispatcher sends a temp/farm-out driver a
  URL with ?token; driver sees only their job, checks in (selfie + vehicle
  photos to Supabase Storage), updates status, sees net pay. No login — the
  token IS the access.

---

## STACK
- Plain HTML/CSS/JS, single files
- Custom lightweight Supabase REST client (raw fetch, NOT the official SDK)
- SheetJS for Excel
- Supabase: tables `jobs`, `team_members`, `team_vehicles`; storage buckets
  `driver-photos`, `team-photos`, `ojo-docs`
- Deployed GitHub → Vercel (each .html is its own page)

---

## THE 5 APPS — BUILD ORDER
Sequenced by data dependency: all apps share the same Supabase tables, so we
lock the data model early and build each layer on a stable one below it.

**PHASE 1 (NOW) — Stabilize index.html + job.html.** Do NOT build new apps until
this is solid:
- Job lifecycle flows clean end-to-end (Offer → Assigned → Accepted →
  Heading to Pickup → Arrived → In Progress → Completed / Cancelled / Voided)
- Dispatch + reassignment reliable
- Driver check-in photo upload reliable
- Pay math correct (base + OT flat $75/hr + 10% OJO commission)
- job.html solid on mobile
- THEN finish: Square payment gateway (sets payment_status) and OT +
  reporting (single + batch Excel export). These define money fields the
  client and affiliate apps will depend on.

**PHASE 2 — driver.html** (authenticated internal driver app). Email/phone OTP
login, admin approval required, drivers see only their own assigned jobs,
check-in / status / pay. Keep job.html as-is for temp/farm-out drivers.

**PHASE 3 — client app.** Clients view their bookings, live status, and
invoices/receipts. Depends on Phase 1 payment data.

**PHASE 4 — affiliate app.** Affiliates/agents refer & book, track commissions.
Built last — needs the full booking→payment chain plus a commission/attribution
layer.

---

## HOW CLAUDE SHOULD WORK
- Read the actual file before writing any code
- Always show a plan and wait for approval before making changes
- Small surgical edits only — never rebuild a whole file without explicit OK
- After each change, commit and push so there's always a working fallback
- `index.html` is ~7,000 lines — read it in sections, don't load it all at once
- Never add features, refactor, or introduce abstractions beyond what the task requires
- No comments unless the WHY is non-obvious

---

## PHASE 1 STABILITY CHECKLIST

### index.html — What's Solid
- Job lifecycle state machine wired end-to-end
- Pay math engine: base rates, OT at $75/hr, 10% OJO commission, poster commission, addons
- `PRICING_CONFIG` centralized with all vehicle rates
- Quick Quote modal
- Driver assignment + auto-status bump
- Waybill generation and print layout
- Excel exports: completed jobs + tour/timesheet + contributions CSV
- Search, filter, date range on job lists
- WhatsApp/SMS dispatch message builder
- Contributions ledger

### index.html — Bugs / Silent Failures (fix in order)
1. `saveJob()` ~line 3290 — no error check after Supabase insert/update; silently fails
2. `loadJobs()` — load failure is console.error only; dispatcher sees blank screen
3. `saveVehicle()`, `saveCompany()`, `saveClient()` — no try/catch (only `saveMember` protected)
4. `addOnCharges` update ~line 4481 — no error check
5. Driver assignment — no check if driver exists in team_members before PATCH
6. Multi-day batch insert — one bad record breaks entire batch silently
7. Seed data (`seedMembersIfEmpty`) — silent failure leaves app with no drivers

### index.html — Incomplete
- Square payment gateway — fully stubbed; payment_type is label only, no SDK
- Manual pricing — no validation (can save $0 or negative price)
- Mini Van + Sprinter missing hourly bracket rates in PRICING_CONFIG

### job.html — What's Solid
- Token-based access with proper error states
- Full status button flow gated by current status
- Cancel flow: reason logged, audit trail appended, job returns to Offer
- Status log append-only in `extras.status_log[]`
- Toast notifications after status changes
- Flight info + Track Flight link
- GPS navigation (Google / Apple / Waze)
- Waybill modal + print layout
- Mobile layout (flexible grid, full-width buttons)

### job.html — Critical Bug (fix first)
1. **Photos never uploaded** — `uploadPhotoToSupabase()` exists but is never called
   in `confirmCheckin()`. All check-in photos are lost on navigation. DATA LOSS.

### job.html — Other Bugs
2. `time_start`/`time_end` stored as `HH:MM` only — no date, ambiguous across midnight
3. Camera permission not pre-checked — silent hang if blocked
4. No selfie retry button if capture fails mid-flow
5. `share_token` exposed in browser history via URL query param

---

## RECOMMENDED FIX ORDER

```
MUST FIX BEFORE CALLING STABLE:
1. Wire photo upload in job.html confirmCheckin()       ← DATA LOSS BUG
2. Add error feedback on saveJob() in index.html        ← SILENT FAILURE
3. Add load failure alert in loadJobs()
4. Add try/catch to saveVehicle, saveCompany, saveClient

SHOULD FIX BEFORE SQUARE INTEGRATION:
5. Validate manual pricing (no $0 / negative)
6. Add hourly rates for Mini Van + Sprinter in PRICING_CONFIG
7. Fix time_start/time_end to full ISO timestamp

NICE TO HAVE:
8. Camera permission pre-check in job.html
9. Selfie retry button
10. Driver assignment validation (check team_members exists first)
```

---

## SUPABASE
- **Project:** ojoluxe-portal (`aadlqagpxwshpdccxwto`)
- **Region:** us-west-2
- **Tables:** `jobs`, `team_members`, `team_vehicles`, `companies`, `clients`
- **Storage buckets:** `driver-photos`, `team-photos`, `ojo-docs`
- **Auth:** Anon key via raw REST fetch (no official SDK)
- **Key columns:**
  - `jobs.share_token` — driver access token for job.html
  - `jobs.reference_code` — OJO-YYYYMMDD-XXXX format
  - `jobs.extras` — JSONB: driver info, status_log, cancel_reason, etc.
  - `jobs.addon_charges` — JSONB array: [{status, amount, description}]

## GITHUB
- **Repo:** ojoluxesmo-App/ojoluxe-portal
- **Deploy:** GitHub → Vercel (automatic on push to main)
- **Dev branch:** `claude/kind-ptolemy-7meup6`
