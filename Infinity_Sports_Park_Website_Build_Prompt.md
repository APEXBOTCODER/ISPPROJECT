# Master Build Prompt — Infinity Sports Park Website

> **How to use this:** Paste this entire document into an AI app builder (Claude, v0, Lovable, Bolt, Cursor) or hand it to a development agency as a functional/technical spec. It is written so an expert engineer or an AI agent can build the full product from it. Sections are ordered by priority, with **Security treated as a first-class requirement, not an afterthought.**

---

## 1. Project Brief

Build a modern, premium, highly visual, fully responsive (mobile-first) website and booking platform for **Infinity Sports Park**, a multi-sport facility near **Argyle, Texas** (10 minutes from Argyle Chowrastha), launching **Summer 2026** and affiliated with the **Argyle Cricket Club (ACC)**.

The site must do two things exceptionally well: (1) sell the experience with a bold, energetic marketing front-end, and (2) run a reliable, secure, real-time **hourly field reservation system** for cricket and soccer with online payments, digital waivers, and full self-service account management.

Core promise to reflect everywhere: **"Where Passion Meets Performance"** and the rhythm **Play • Train • Compete • Inspire.**

---

## 2. Brand & Visual Identity

Match the supplied logo exactly. Pull the palette and energy from it.

- **Primary colors:** Deep navy blue (`#0A2540` / `#0D2B4E`), vibrant lime-to-forest green (`#5CB82A` / `#4C9A2A`), bright accent blue (`#1E6FD9`), crisp white (`#FFFFFF`).
- **Gradients:** Use the green→blue infinity gradient as a signature accent (buttons, dividers, highlights, the loop motif).
- **Typography:** Bold, condensed, italicized sport display type for headings (think athletic, aggressive uppercase like the logo's "INFINITY SPORTS PARK"); clean, highly legible sans-serif (Inter, Manrope, or similar) for body and UI.
- **Imagery:** Wide aerial turf/pitch shots, action photography of cricket batting and soccer, families enjoying the park. Bright daylight, blue skies, lush green fields.
- **Mood:** Premium, energetic, trustworthy, family-friendly. Not corporate-sterile — alive and competitive.
- **Iconography:** Reuse the logo's feature icons — cricket grounds, soccer fields, training facility, practice nets, tournaments & events, family-friendly environment.
- **Motion:** Tasteful micro-interactions (hover lifts, animated infinity loop, subtle parallax on the hero, count-up stats). Respect `prefers-reduced-motion`.

---

## 3. Recommended Technical Stack

Use a modern, secure, well-supported stack. Substitute equivalents only if there's a strong reason.

- **Framework:** Next.js (App Router) + React + TypeScript — server components, SSR/SSG for SEO, API routes for backend.
- **Styling:** Tailwind CSS + a component library (shadcn/ui or Radix UI primitives) for accessible, consistent UI.
- **Database:** PostgreSQL with Prisma ORM (typed, migration-managed). Use row-level constraints and transactions for booking integrity.
- **Authentication:** Auth.js (NextAuth) or Clerk — email/password + Google/Apple OAuth, with verified email and optional MFA.
- **Payments:** **Stripe** (Checkout + Payment Intents + Customer Portal). Never build a custom card form that touches raw PAN data.
- **Email/SMS:** Resend or Postmark (transactional email); Twilio for optional SMS reminders.
- **File/asset storage:** S3-compatible bucket (signed URLs) for waiver PDFs and profile assets.
- **Hosting:** Vercel (front-end/API) or AWS; managed Postgres (Neon, Supabase, or RDS). Everything over HTTPS/TLS 1.2+.
- **Caching/real-time:** Use short-TTL caching for availability reads and DB transactions (or Redis locks) to prevent double-booking on writes.
- **Observability:** Sentry (errors), structured logging, uptime monitoring.

---

## 4. Site Map / Pages

**Public / marketing**
- **Home** — hero with infinity-loop motif, value props, sport highlights, "Launching Summer 2026" banner, featured CTA "Book a Field."
- **Facilities** — cricket grounds, soccer fields, practice nets, training facility; specs, photos, amenities, capacity.
- **Cricket** & **Soccer** — sport-specific pages (formats supported, turf type, equipment, rules of the venue).
- **Tournaments & Events** — upcoming events, league info, how to register a team.
- **Training / Coaching** — programs, coaches, session booking.
- **Membership & Pricing** — hourly rates, peak/off-peak, member tiers, packages.
- **Gallery** — photo/video.
- **About** — story, ACC affiliation, mission, location near Argyle TX with embedded map + "10 mins from Argyle Chowrastha."
- **FAQ**, **Contact**, **Blog/News** (optional).
- **Legal:** Terms of Service, Privacy Policy, Cancellation/Refund Policy, Waiver & Liability.

**Authenticated / app**
- **Booking flow** (the core engine — see §5).
- **My Account / Dashboard** — upcoming & past reservations, payment receipts, saved waivers, profile, payment methods (via Stripe portal).
- **Reservation detail** — modify, cancel, re-book, add to calendar, share.

**Admin (staff only)**
- Dashboard, calendar of all fields, manual bookings/blocks (maintenance), pricing & rules management, user management, refunds, event creation, reporting/analytics, waiver records, audit log.

---

## 5. Reservation Engine (Core Feature — Build This Carefully)

**Resources & granularity**
- Bookable resources: each **cricket ground**, **soccer field**, **practice net**, and **training facility** is an independent, configurable resource.
- **Hourly** time slots (allow 30-min increments configurable per resource). Define operating hours per day; support seasonal hours and blackout dates.
- Configurable rules per resource: min/max booking duration, buffer/turnaround time between bookings, advance-booking window (e.g., up to 60 days out), and same-day cutoff.

**Availability & booking flow**
1. User picks **sport → facility → date → duration**.
2. Show a **real-time availability calendar/grid** (clear visual of free vs. booked vs. blocked slots; timezone = America/Chicago).
3. User selects slot(s) → live price calculation (peak/off-peak, member discount, taxes, promo code).
4. **Mandatory digital waiver** must be signed/accepted before payment if not already on file (see §7).
5. **Stripe Checkout / Payment Intent** → payment captured.
6. On success: create confirmed reservation, send email (+ optional SMS) confirmation with calendar invite (.ics), receipt, and cancellation link.

**Integrity — must-haves**
- **Prevent double-booking** with database transactions and unique constraints (or distributed locks). A slot held during checkout should be soft-locked for N minutes, then released if unpaid.
- Handle concurrent requests gracefully; never confirm two paid bookings for the same slot.
- Support **recurring bookings** (weekly team practice) and **multi-slot / multi-field** bookings in one cart/checkout.
- Support **team/group bookings** with a captain and optional split details.

**Cancellation & modification (self-service)**
- Users cancel or reschedule from their dashboard, subject to a configurable policy (e.g., full refund >48h, 50% 24–48h, none <24h).
- Automatic **refunds via Stripe** per policy; status reflected immediately in account history.
- Email confirmations for every change.

**Pricing & promotions**
- Peak/off-peak and weekend pricing; member vs. non-member rates; seasonal rates.
- Promo/discount codes, packages/credits (e.g., buy 10 hours), and gift cards (optional).
- Transparent tax + fee breakdown before payment.

---

## 6. Accounts & User Management

- **Sign up / log in** via email+password (with verification) and social OAuth (Google/Apple).
- **Optional MFA** (TOTP authenticator app), strongly encouraged for staff.
- **Profile:** name, contact, emergency contact, household/family members (so a parent can book and waive for minors).
- **Account history:** all reservations (upcoming/past), payment receipts, refunds, signed waivers (downloadable PDF), and credits/packages balance.
- **Saved payment methods** handled exclusively through **Stripe Customer Portal** (no raw card data on your servers).
- **Notification preferences:** email/SMS reminders (e.g., 24h before), marketing opt-in (separate, GDPR/CAN-SPAM compliant).
- **Password reset, email change, and account deletion** (data export + right-to-be-forgotten support).

---

## 7. Digital Waivers & Liability (Required)

- Legally structured **liability waiver / release** that must be electronically signed before first play and re-signed when the document version changes.
- Support **adult self-waiver** and **parent/guardian waiver for minors** (capture minor's name, DOB, guardian relationship).
- Capture **signature, full name, date/time, IP address, and document version** for legal enforceability; generate and store a **timestamped PDF** in secure storage, retrievable from the user's account and the admin panel.
- Block booking completion until a valid, current waiver is on file for every participant where required.
- Keep an immutable audit trail of all waiver acceptances. **Have a licensed attorney review the waiver wording for Texas law before launch** (include this as a launch checklist item — this prompt is not legal advice).

---

## 8. Security Requirements (TOP PRIORITY)

Treat security as a release-blocking requirement. Implement all of the following:

**Payments & PCI**
- Use Stripe-hosted/embedded payment UI so **card data never touches your servers** (PCI-DSS SAQ-A scope). Never log, store, or transmit raw PAN/CVV.
- Verify Stripe **webhooks via signing secret**; make payment-confirmation handlers idempotent.

**Transport & data**
- Enforce **HTTPS/TLS everywhere**, HSTS, secure cookies (`HttpOnly`, `Secure`, `SameSite`).
- Encrypt data **in transit and at rest**; encrypt/segregate PII; restrict DB access to least privilege.

**Authentication & sessions**
- Hash passwords with **bcrypt/argon2**; enforce strong password policy; offer MFA.
- Short-lived, rotated session tokens; secure logout; session invalidation on password change.
- **Rate limiting + brute-force protection** on auth and booking endpoints; lockout/backoff; CAPTCHA on signup/login if abused.

**Application hardening**
- Prevent **SQL injection** (parameterized queries/ORM), **XSS** (output encoding, CSP headers), **CSRF** (tokens/SameSite), and clickjacking (`X-Frame-Options`/frame-ancestors).
- Strict **server-side input validation and authorization checks** on every endpoint (never trust the client; verify the user owns the reservation before modify/cancel).
- Secure HTTP headers (CSP, Referrer-Policy, Permissions-Policy). Dependency scanning and regular patching.
- **Role-based access control (RBAC):** customer vs. staff vs. admin, enforced server-side.

**Privacy & compliance**
- **CCPA/GDPR-aligned** privacy practices: consent, data-export, deletion, and a clear privacy policy.
- Minimize collected data; document retention periods; secure handling of minors' data.
- Maintain an **audit log** of sensitive actions (refunds, role changes, waiver records, admin overrides).

**Operations**
- Automated encrypted **database backups** + tested restore.
- Secrets in a vault / environment variables (never in the repo). Separate dev/staging/prod.
- Error monitoring without leaking PII; rate-limited, sanitized logs.

---

## 9. Admin / Operations Panel

- Master **calendar view** across all fields with drag-to-block for maintenance.
- Create/edit/cancel bookings on behalf of customers; issue refunds; apply credits.
- Manage **pricing rules, hours, blackout dates, resources, and promo codes**.
- **Event & tournament** creation with team registration and capacity.
- **User management** (search, view history, reset, ban), **waiver records**, **payment/refund ledger**.
- **Reporting & analytics:** utilization by field/hour, revenue, peak demand, no-shows, cancellation rates — exportable to CSV.

---

## 10. Notifications

- Transactional email + optional SMS for: booking confirmation (with .ics calendar invite and receipt), reminder (configurable, e.g., 24h prior), cancellation/refund confirmation, waiver-required and waiver-signed receipts, password/security alerts.
- Admin alerts for failed payments, high-value refunds, and suspicious activity.

---

## 11. Performance, SEO & Accessibility

- **Mobile-first**, fast (target Lighthouse 90+), optimized images (next/image), lazy loading, minimal layout shift.
- **SEO:** semantic HTML, metadata, Open Graph/Twitter cards, sitemap, structured data (LocalBusiness/SportsActivityLocation), local SEO for "Argyle, Texas sports facility / cricket ground / soccer field rental."
- **Accessibility:** WCAG 2.1 AA — keyboard navigation, focus states, ARIA, color contrast, screen-reader-friendly booking grid.
- Embedded Google Map + directions; click-to-call; clear hours and contact.

---

## 12. Deliverables & Definition of Done

- Fully responsive marketing site + working reservation engine with live Stripe payments (test mode first), digital waivers, account self-service (history, cancel, modify), and admin panel.
- All §8 security controls implemented and verified.
- Seed data for fields, hours, and sample pricing so the booking flow is demonstrable end to end.
- Clean, typed, documented codebase; environment config via `.env`; README with setup/deploy steps.
- Pre-launch checklist: attorney-reviewed waiver & policies, PCI/Stripe verification, security/pen-test pass, backup/restore test, accessibility audit, and load test on the booking endpoint.

---

### Build priority order
1. Auth + accounts (secure foundation)
2. Reservation engine + availability integrity
3. Stripe payments + refunds
4. Digital waivers
5. Account dashboard (history, cancel, modify)
6. Admin panel
7. Marketing/front-end polish + SEO + accessibility
8. Notifications, analytics, and nice-to-haves

> Reminder: This document is a technical/product spec, not legal or financial advice. Have the waiver, terms, privacy policy, and payment/refund flows reviewed by a qualified attorney and ensure Stripe/PCI obligations are met before going live.
