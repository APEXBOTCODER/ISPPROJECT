# Infinity Sports Park — End-to-End Project & Action Plan

> Companion to `Infinity_Sports_Park_Website_Build_Prompt.md`. This document turns the spec into an executable plan: what to set up, in what order, how to configure hosting, and what "done" looks like at each phase.

---

## 1. What We're Building (Recap)

Two products in one codebase:

1. **Marketing site** — premium, mobile-first brand experience for the park (Home, Facilities, Cricket, Soccer, Tournaments, Training, Pricing, Gallery, About, FAQ, Contact, Legal).
2. **Booking platform** — real-time hourly field reservations with Stripe payments, digital waivers, self-service accounts, and a staff admin panel.

**Architecture:** Next.js (App Router, TypeScript) monolith on Vercel · PostgreSQL (Neon) via Prisma · Auth.js · Stripe · Resend (email) · Twilio (optional SMS) · Cloudflare R2 or S3 (waiver PDFs) · Sentry (monitoring).

---

## 2. Accounts & Services to Provision (Do This First)

Create these accounts before development starts. Use a shared business email (e.g., `tech@infinitysportspark.com` or a Google Workspace group), **not** a personal email, and enable MFA on every account.

| # | Service | Purpose | Plan to start | Setup notes |
|---|---------|---------|---------------|-------------|
| 1 | Domain registrar (Cloudflare Registrar or Namecheap) | `infinitysportspark.com` (+ defensive `.net`, common misspellings) | ~$10–15/yr each | Put DNS on Cloudflare (free) for flexibility |
| 2 | GitHub (organization) | Code, CI/CD, issue tracking | Free | Create org `infinity-sports-park`; enable Dependabot + secret scanning |
| 3 | Vercel | Hosting, previews, CDN, edge network | Hobby for dev → **Pro ($20/mo)** before launch | Connect to the GitHub repo |
| 4 | Neon (or Supabase) | Managed PostgreSQL | Free tier → Launch plan (~$19/mo) at go-live | Create separate **dev**, **staging**, **prod** branches/projects |
| 5 | Stripe | Payments, refunds, customer portal | Pay-as-you-go (2.9% + 30¢) | Business verification takes days — **start early**; needs EIN, bank account, business details |
| 6 | Resend (or Postmark) | Transactional email | Free tier → ~$20/mo | Requires DNS records (SPF/DKIM/DMARC) on your domain |
| 7 | Twilio (optional, Phase 8) | SMS reminders | Pay-as-you-go | A2P 10DLC registration for US SMS takes ~1–2 weeks — start early if SMS is wanted at launch |
| 8 | Cloudflare R2 (or AWS S3) | Waiver PDF storage | ~Free at this scale | Private bucket, signed URLs only |
| 9 | Sentry | Error monitoring | Free tier | One project for web + API |
| 10 | Google Cloud Console | Google OAuth + Maps embed | Free / minimal | OAuth consent screen verification can take days — start early |
| 11 | Apple Developer (optional) | Apple Sign-In | $99/yr | Only if Apple OAuth is required at launch; can defer |
| 12 | UptimeRobot / BetterStack | Uptime monitoring | Free | Ping homepage + a health-check API route |

**Also start now (long lead times, non-technical):**
- **Attorney engagement** for Texas-law waiver, ToS, privacy policy, refund policy (spec §7, §12 — launch blocker).
- **Business bank account + EIN** if not already done (Stripe requires it).
- **Photography** — aerial/action shots of the actual facility for the marketing site.

---

## 3. Repository & Local Development Setup

### 3.1 Prerequisites on each developer machine
- Node.js 20 LTS (via `nvm-windows` or installer), pnpm (`corepack enable`)
- Git, VS Code (or Cursor), Docker Desktop (for local Postgres) — or use a Neon dev branch instead of local Docker
- Stripe CLI (`stripe login`) for local webhook testing

### 3.2 Project scaffolding
```powershell
npx create-next-app@latest infinity-sports-park --typescript --tailwind --app --src-dir --eslint
cd infinity-sports-park
pnpm add prisma @prisma/client next-auth@beta @auth/prisma-adapter stripe zod react-hook-form
pnpm add resend @react-email/components date-fns date-fns-tz
pnpm dlx shadcn@latest init
npx prisma init
git init && git remote add origin <github-repo-url>
```

### 3.3 Environment variables (`.env.local`, never committed)
```ini
# Database
DATABASE_URL=postgresql://...           # Neon pooled connection string
DIRECT_URL=postgresql://...             # Neon direct (for Prisma migrations)

# Auth
AUTH_SECRET=                            # `npx auth secret`
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
NEXTAUTH_URL=http://localhost:3000

# Stripe
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...         # from `stripe listen` locally

# Email
RESEND_API_KEY=
EMAIL_FROM=bookings@infinitysportspark.com

# Storage (R2/S3)
S3_ENDPOINT=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_BUCKET=waivers

# Misc
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SENTRY_DSN=
TZ_DEFAULT=America/Chicago
```
Commit a `.env.example` with keys but no values. Production secrets live **only** in Vercel's environment settings.

### 3.4 Branch & environment strategy
- `main` → production (auto-deploys to `infinitysportspark.com`)
- `develop` → staging (auto-deploys to `staging.infinitysportspark.com`, password-protected via Vercel)
- Feature branches → Vercel preview deployments per PR
- Each environment gets its own database (Neon branches) and its own Stripe mode (test keys everywhere except prod).
- GitHub Actions CI on every PR: typecheck, lint, unit tests, `prisma migrate diff` check.

---

## 4. Build Phases (Priority Order from the Spec)

Estimates assume one experienced full-stack developer (or AI-assisted equivalent). Total: **~12–16 weeks** to launch-ready.

### Phase 0 — Foundation (Week 1)
- Provision all §2 accounts; register domain; set up DNS on Cloudflare.
- Scaffold repo (§3.2), CI pipeline, Vercel project, Neon databases, Sentry.
- Tailwind theme tokens from the logo: navy `#0A2540`/`#0D2B4E`, greens `#5CB82A`/`#4C9A2A`, accent blue `#1E6FD9`; display font (e.g., a bold italic condensed face) + Inter/Manrope for body.
- Base layout: header, footer, infinity-gradient design system primitives (buttons, cards, section dividers).
- **Done when:** "Hello world" deploys to staging + prod URLs over HTTPS with CI green.

### Phase 1 — Auth & Accounts (Weeks 2–3)
- Auth.js with email+password (argon2/bcrypt hashing, email verification) + Google OAuth; Apple optional/deferred.
- Prisma models: `User`, `Account`, `Session`, `HouseholdMember` (for minors), `Role` (CUSTOMER / STAFF / ADMIN).
- Profile management, password reset, email change, account deletion (soft-delete + data export stub).
- Security baseline: rate limiting on auth routes (Upstash Redis or Vercel WAF rules), secure cookies, CSP/HSTS/security headers via `next.config` middleware, server-side RBAC helper used by every protected route.
- **Done when:** signup → verify → login → profile edit → logout works; headers score A on securityheaders.com.

### Phase 2 — Reservation Engine (Weeks 3–6) ⚠️ the core
- Prisma models: `Resource` (cricket ground / soccer field / net / training room with per-resource rules), `OperatingHours`, `BlackoutDate`, `PricingRule` (peak/off-peak/weekend/member), `Booking`, `BookingSlot`, `Hold`.
- **Double-booking prevention:** Postgres exclusion constraint on `(resource_id, tstzrange(start, end))` using `btree_gist` — the database itself rejects overlaps; wrap booking creation in a serializable transaction. Soft holds: `Hold` rows with `expires_at` (10 min), cleaned by cron.
- Availability API: short-TTL cached reads (30–60 s) + revalidation on write; all times stored UTC, displayed in `America/Chicago`.
- Booking UI: sport → facility → date → duration → interactive grid (free/held/booked/blocked), live price calculation, multi-slot cart, recurring bookings (weekly), team/captain field.
- **Done when:** load test (k6 or Artillery) firing concurrent bookings at the same slot never produces two confirmations.

### Phase 3 — Stripe Payments & Refunds (Weeks 6–8)
- Stripe Checkout sessions from the cart; Payment Intents metadata links to the `Hold`.
- **Webhook handler** (`/api/webhooks/stripe`): verify signing secret, idempotency keys, on `checkout.session.completed` → convert hold to confirmed `Booking` inside a transaction.
- Cancellation/reschedule with policy engine (configurable: full refund >48 h, 50% 24–48 h, none <24 h) → automatic Stripe refunds.
- Stripe Customer Portal for saved payment methods; promo codes via Stripe Coupons or internal `PromoCode` table.
- **Done when:** full flow works in Stripe test mode incl. failed payment, expired hold release, refund per policy, and webhook replay is idempotent.

### Phase 4 — Digital Waivers (Weeks 8–9)
- `WaiverDocument` (versioned text), `WaiverSignature` (user/minor, name, DOB, guardian relation, signature image or typed name, timestamp, IP, doc version) — append-only table, no updates/deletes.
- Booking flow blocks payment until a current-version waiver is on file for every participant.
- Generate timestamped PDF (e.g., `@react-pdf/renderer` or Puppeteer on a serverless function) → store in R2 with signed-URL retrieval from the user dashboard and admin panel.
- **Done when:** new user is forced through the waiver, PDF lands in storage, re-sign is required after a version bump, audit trail is immutable.

### Phase 5 — Customer Dashboard (Weeks 9–10)
- Upcoming/past reservations, cancel/reschedule (policy-aware), receipts, `.ics` download + email attachment, waiver PDFs, credits balance, notification preferences.
- **Done when:** a customer can self-serve every lifecycle action without staff help.

### Phase 6 — Admin Panel (Weeks 10–12)
- Staff-only area (RBAC-enforced server-side): master calendar across all resources, drag-to-block maintenance windows, manual bookings/cancellations/refunds, pricing & hours & blackout management, promo codes, user search/history/ban, waiver records, payment ledger.
- Reporting: utilization by field/hour, revenue, peak demand, cancellations — CSV export.
- `AuditLog` table recording every sensitive admin action (who, what, when, before/after).
- **Done when:** staff can run a full day's operations without touching the database.

### Phase 7 — Marketing Site & Polish (Weeks 12–14)
- All public pages from spec §4 with final copy + real photography; "Launching Summer 2026" hero with animated infinity loop (respecting `prefers-reduced-motion`).
- SEO: metadata, OG/Twitter cards, sitemap, `SportsActivityLocation` structured data, local-SEO copy for "Argyle Texas cricket ground / soccer field rental"; Google Business Profile.
- Accessibility pass to WCAG 2.1 AA (keyboard-navigable booking grid, contrast, focus states); Lighthouse ≥ 90 mobile.
- Embedded Google Map, click-to-call, hours.
- **Done when:** Lighthouse ≥90 across the board, axe-core clean, all pages responsive 360 px → 4 K.

### Phase 8 — Notifications & Nice-to-haves (Weeks 14–15)
- Email templates (React Email): confirmation + `.ics`, 24 h reminder (Vercel Cron), cancellation/refund, waiver receipts, security alerts.
- Optional: Twilio SMS reminders, gift cards, hour packages/credits, blog.
- Admin alerts: failed payments, high-value refunds.

### Phase 9 — Hardening & Launch (Weeks 15–16) — see checklists §6–7

---

## 5. Hosting & Deployment Configuration (Step by Step)

### 5.1 Vercel
1. Import the GitHub repo into Vercel (framework auto-detected: Next.js).
2. Set **Production branch** = `main`; map `develop` to a fixed staging domain under *Settings → Domains*.
3. Add environment variables per environment (Production / Preview / Development) — Stripe **live** keys only in Production.
4. Enable **Vercel Firewall / WAF** managed rules + rate limiting on `/api/auth/*` and `/api/bookings/*` (Pro plan).
5. Add `vercel.json` / Next middleware for security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy).
6. Create **Vercel Cron** jobs: expire stale holds (every 5 min), send 24 h reminders (hourly), cleanup tasks (nightly).

### 5.2 DNS (Cloudflare)
| Record | Name | Value | Purpose |
|--------|------|-------|---------|
| A / CNAME | `@`, `www` | per Vercel instructions | Site |
| CNAME | `staging` | `cname.vercel-dns.com` | Staging |
| TXT/CNAME | per Resend | SPF, DKIM, DMARC | Email deliverability |
| MX | `@` | Google Workspace / email host | Business inbox |

Set DMARC to `p=quarantine` after a week of clean reports. Keep Cloudflare proxy **off** (DNS-only) for Vercel records.

### 5.3 Database (Neon)
1. Create project `infinity-sports-park`, region **AWS us-east-2 (Ohio)** or closest to TX users.
2. Branches: `main` (prod), `staging`, `dev`. Use the **pooled** connection string for the app, **direct** for migrations.
3. Enable point-in-time restore; verify a restore once before launch (spec §8 backup requirement).
4. Migrations only via `prisma migrate deploy` in CI — never `db push` against prod.

### 5.4 Stripe
1. Complete business verification (EIN, bank account) — do this in week 1.
2. Test mode throughout development; create Products/Prices via seed script, not hand-entry.
3. Webhook endpoints: prod `https://infinitysportspark.com/api/webhooks/stripe`, staging equivalent, local via `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
4. Enable Customer Portal (Settings → Billing); configure branded receipt emails, statement descriptor `INFINITY SPORTS`.
5. Turn on Stripe Radar default rules; confirm **PCI SAQ-A** scope (hosted checkout only — never render a custom card form).

### 5.5 Storage (Cloudflare R2)
1. Create private bucket `isp-waivers-prod` (+ staging). No public access.
2. API token scoped to that bucket only; app generates time-limited signed URLs for downloads.

### 5.6 Observability
- Sentry via `@sentry/nextjs` wizard; scrub PII in `beforeSend`.
- Vercel Analytics + Speed Insights; UptimeRobot on `/` and `/api/health`.

---

## 6. Security Checklist (Release Blockers, from Spec §8)

- [ ] All payment UI is Stripe-hosted; no card data on our servers (SAQ-A)
- [ ] Stripe webhooks signature-verified + idempotent
- [ ] HTTPS everywhere, HSTS preload, secure/HttpOnly/SameSite cookies
- [ ] Passwords argon2/bcrypt-hashed; MFA available (required for staff/admin)
- [ ] Rate limiting + lockout on auth and booking endpoints
- [ ] Parameterized queries only (Prisma); CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy headers
- [ ] Server-side authorization on every endpoint (ownership checks on reservation modify/cancel)
- [ ] RBAC enforced server-side; admin routes inaccessible to customers (tested)
- [ ] Audit log on refunds, role changes, waiver records, admin overrides
- [ ] Secrets only in Vercel env vars; dev/staging/prod fully separated
- [ ] Encrypted DB backups + **tested restore**
- [ ] Dependency scanning (Dependabot) green; `pnpm audit` clean
- [ ] Logs sanitized — no PII, no tokens
- [ ] Third-party penetration test or thorough security review completed

## 7. Pre-Launch Checklist (Spec §12)

- [ ] Attorney-reviewed waiver, ToS, privacy policy, refund policy (Texas law)
- [ ] Stripe live-mode verification + one real end-to-end booking with a live card (then refund)
- [ ] Load test on booking endpoint — zero double-bookings under concurrency
- [ ] Accessibility audit (WCAG 2.1 AA) and Lighthouse ≥ 90 mobile
- [ ] Backup/restore drill passed
- [ ] Seed data: all fields, operating hours, pricing live and correct
- [ ] DNS, SSL, email deliverability (mail-tester.com ≥ 9/10)
- [ ] Google Business Profile + Search Console + sitemap submitted
- [ ] Staff trained on admin panel; runbook written for refunds/outages
- [ ] Monitoring alerts wired to a real phone/inbox

---

## 8. Estimated Operating Costs (Monthly, at Launch Scale)

| Item | Cost |
|------|------|
| Vercel Pro | $20 |
| Neon Launch | ~$19 |
| Resend | $0–20 |
| Cloudflare (DNS + R2) | ~$0–5 |
| Sentry | $0 (free tier) |
| Twilio SMS (optional) | usage (~$0.008/msg) |
| Domain(s) | ~$1–3 amortized |
| Stripe | 2.9% + 30¢ per transaction |
| **Total fixed** | **~$45–70/mo** + payment processing |

One-time: attorney review (~$500–2,000), Apple Developer ($99/yr, optional), photography.

---

## 9. Suggested Team / Effort

- **Solo full-stack dev (AI-assisted):** 12–16 weeks
- **Two devs (one front-end-leaning, one back-end-leaning):** 8–10 weeks
- Plus: content/copy owner (club side), photographer, attorney, and a staff member to UAT the admin panel.

## 10. Immediate Next Actions (This Week)

1. Register domain + set up Cloudflare DNS, GitHub org, Vercel, Neon, Sentry.
2. Start Stripe business verification and attorney engagement (longest lead times).
3. Start Google OAuth consent screen verification (and Twilio A2P if SMS at launch).
4. Scaffold the repo per §3.2 and get the Phase 0 deploy live on staging.
5. Collect brand assets: logo SVG/PNG exports, fonts, photography plan, final copy owners.
