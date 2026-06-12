# Infinity Sports Park — Website & Booking Platform

Marketing site + hourly field reservation system for Infinity Sports Park
(near Argyle, TX · launching Summer 2026 · affiliated with Argyle Cricket Club).

Built with **Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Prisma 7 ·
Auth.js v5 · SQLite (dev) / PostgreSQL (prod)**.

---

## Quick start

```bash
npm install
npx prisma migrate dev   # create/refresh the local database
npm run db:seed          # fields, pricing, waiver v1, demo accounts
npm run dev              # http://localhost:3000
```

Demo accounts (created by the seed — change before any shared deployment):

| Role | Email | Password |
|---|---|---|
| Admin | `admin@infinitysportspark.com` | `REDACTED` |
| Customer | `demo@example.com` | `REDACTED` |

Useful scripts: `npm run build` (production build), `npm run db:studio`
(database GUI), `npx tsx scripts/test-double-booking.ts` (concurrency
integrity check — must always report exactly 1 winner).

---

## What's implemented

- **Marketing site** — Home, Facilities, Cricket, Soccer, Tournaments,
  Training, Pricing, Gallery, About, FAQ, Contact, Legal (4 docs), all
  mobile-first and on-brand (navy/green/blue, infinity gradient, athletic type).
- **Auth** — email+password (bcrypt, 10-char minimum), JWT sessions, roles
  (CUSTOMER / STAFF / ADMIN) enforced server-side on every protected page and
  action. Google sign-in activates automatically when keys are present (below).
- **Account verification** — 6-digit email code issued at signup (required
  before booking) and optional SMS phone verification at `/verify`. Codes are
  SHA-256 hashed, expire in 10 minutes, max 5 attempts, 60s resend cooldown.
  Delivery follows the email/SMS provider toggles (console in dev).
- **Reservation engine** — sport → facility → date → hourly slot grid with
  live availability, peak/off-peak pricing (weekday 5pm+ & weekends), up to 6
  consecutive hours, 60-day advance window. **Double-booking is impossible**:
  slots are unique rows at the database level; concurrent checkouts race on a
  unique constraint and exactly one wins (see `scripts/test-double-booking.ts`).
  Unpaid holds auto-release after 10 minutes.
- **Payments** — provider abstraction with a **mock provider** (default) that
  simulates success so the whole flow is testable today. Stripe slots in via
  env toggle (below).
- **Digital waiver** — versioned document, blocking gate before checkout,
  adult + parent/guardian (minor) signatures, append-only records with name,
  IP, timestamp, and version. Shown in the dashboard.
- **Customer dashboard** — upcoming/past bookings, one-click cancellation with
  the policy applied automatically (100% ≥48h, 50% 24–48h, 0% <24h), waiver
  status, logout.
- **Admin panel** (`/admin`, staff/admin only) — stats, all upcoming bookings
  with cancel+refund, maintenance blocks (hour-range blocking that shares the
  same collision guard as paid bookings), user list.
- **Email** — console provider (default) logs every message; Resend slots in
  via env toggle.

## Integration toggles — flip these as accounts become ready

All switches live in `.env` (see `.env.example`). The app runs fully with the
defaults; each integration is an env change plus, at most, one small TODO block.

### 1. Stripe (when business verification completes)

1. `npm install stripe`
2. In `.env`: set `PAYMENTS_PROVIDER="stripe"`, `STRIPE_SECRET_KEY`,
   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`.
3. Implement the two `TODO(stripe)` blocks in `src/lib/payments.ts`
   (Checkout Session creation + Refund call) and add the webhook route
   `src/app/api/webhooks/stripe/route.ts` that confirms the PENDING booking on
   `checkout.session.completed` (verify the signature with the webhook secret).
4. Test in Stripe **test mode** first; webhook locally via
   `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.

Until then, the mock provider confirms bookings instantly and labels
everything "Test mode — no card charged".

### 2. Email via Resend (when the domain is live)

1. `npm install resend`
2. Verify the domain in Resend (SPF/DKIM/DMARC DNS records).
3. `.env`: `EMAIL_PROVIDER="resend"`, `RESEND_API_KEY`, `EMAIL_FROM`.
4. Replace the `TODO(resend)` block in `src/lib/email.ts` (3 lines).

### 2b. SMS via Twilio (verification codes + reminders)

1. `npm install twilio`; complete **A2P 10DLC registration** (takes 1–2 weeks
   for US numbers — start early).
2. `.env`: `SMS_PROVIDER="twilio"`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
   `TWILIO_FROM_NUMBER`.
3. Replace the `TODO(twilio)` block in `src/lib/sms.ts` (3 lines).

Until then, SMS verification codes print to the server console.

### 3. Google sign-in

1. Google Cloud Console → OAuth consent screen → credentials for a web app
   with redirect URI `https://<domain>/api/auth/callback/google`
   (and `http://localhost:3000/api/auth/callback/google` for dev).
2. `.env`: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`.
3. Done — the "Continue with Google" button appears automatically.

### 4. Legal documents (when attorney review completes)

1. Replace the body text in `src/content/legal.ts` (terms, privacy, refunds,
   waiver summary).
2. Replace the waiver text by inserting a **new** `WaiverDocument` row with
   `version: 2` (never edit v1 — signatures reference it). Everyone will be
   re-prompted to sign automatically.
3. `.env`: `LEGAL_REVIEWED="true"` — all DRAFT banners disappear.

### 5. Photography

1. Drop final images into `public/images/`.
2. Replace `<PhotoPlaceholder …>` usages with `next/image` `<Image>` tags —
   each placeholder is labeled with the intended shot.

### 6. Domain & production deploy

1. `.env` (in Vercel): `NEXT_PUBLIC_SITE_URL="https://infinitysportspark.com"`,
   fresh `AUTH_SECRET` (`npx auth secret`).
2. **Database**: switch `prisma/schema.prisma` datasource to `postgresql`,
   set `DATABASE_URL` to the managed Postgres (Neon) URL, swap the driver
   adapter in `src/lib/prisma.ts`/`prisma/seed.ts` to `@prisma/adapter-pg`,
   and run `prisma migrate dev` to regenerate migrations for Postgres.
   Consider adding a `tstzrange` exclusion constraint for extra overlap safety.
3. Deploy to Vercel (repo root → set project root to `website/`).
4. Point DNS per the hosting plan (`../PROJECT_PLAN.md` §5).

## Architecture notes

- **Times** are park-local (America/Chicago) everywhere: bookings store a
  `YYYY-MM-DD` date string plus integer start/end hours; slot uniqueness uses
  a `"date:HH"` key per resource. No UTC conversion ambiguity in v1.
- **Maintenance blocks** are bookings with status `BLOCKED`, so they occupy
  slot rows through the same unique constraint as paid bookings — staff can
  never block over a sold slot and customers can never buy a blocked one.
- **Server actions** do all mutations; every action re-checks the session and
  (for admin) the role. Nothing trusts the client.
- **Waiver signatures** are append-only; cancellations never delete the
  booking row (only its slot rows), preserving payment history.

## Pre-launch checklist (abridged — full version in ../PROJECT_PLAN.md)

- [ ] Attorney-approved waiver + legal docs loaded, `LEGAL_REVIEWED=true`
- [ ] Stripe live keys + webhook verified, one real transaction tested
- [ ] Postgres migration + backup/restore drill
- [ ] Change/disable seeded demo accounts
- [ ] Rate limiting on auth + booking endpoints (Vercel WAF or Upstash)
- [ ] Security headers (CSP/HSTS) via proxy.ts or vercel.json
- [ ] Real photography + final copy + Google Map embed
- [ ] Accessibility + Lighthouse pass
