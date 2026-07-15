# Deploying Infinity Sports Park

A complete, copy-paste deployment guide for **infinitysportspark.com** — database,
email, PDF downloads, custom domain, and security hardening.

- **App:** Next.js 16 (App Router) + Prisma 7 + Auth.js v5
- **Files/PDFs:** stored as BLOBs **inside the database** (media images, sealed
  waiver PDFs). There is **no S3/bucket to configure** — back up the DB and you've
  backed up every uploaded image and signed waiver.
- **Email:** Resend (wired in `src/lib/email.ts`)
- **Payments:** currently `mock` (no real money moves) — see §7 to go live later.

---

## 0. TL;DR — which host?

| Option | Effort | Cost | DB | When to pick it |
|---|---|---|---|---|
| **A. Railway** (recommended) | Lowest | ~$5/mo + trial credit | SQLite on a volume (your code, unchanged) | Fastest path to live. Single facility, normal traffic. |
| **B. Vercel + Neon Postgres** | Medium | Free tier to start | Managed Postgres | Best long-term scaling; requires a one-time Postgres switch (§Option B). |
| **C. AWS Lightsail** | Higher | ~$10–15/mo | Postgres (RDS) or SQLite on the instance | You specifically want to stay in AWS. |

Your app was built on **SQLite**, so **Option A keeps everything exactly as-is** and
is the easiest. Postgres (Options B/C) scales further and gives managed backups, at
the cost of a small one-time migration described in **Option B**.

> **The one hard limit of the SQLite path:** run **exactly one instance** (no
> horizontal scaling). SQLite is a single file with a single writer. For this
> business that's fine; when you outgrow it, move to Postgres with the steps below.

---

## 1. Prerequisites (do these once, for any option)

1. **Push the repo to GitHub** (private is fine).
   ```bash
   # from C:\local-repo\infinity_sports_park
   git remote add origin https://github.com/<you>/infinity-sports-park.git
   git push -u origin main
   ```
   The app lives in the **`website/`** subfolder — every host below has a
   "root directory" setting you point at `website`.

2. **Generate an auth secret** (you'll paste this into the host later):
   ```bash
   npx auth secret          # prints a 32-byte base64 string
   ```

3. **Have your domain registrar login ready** (wherever you bought
   infinitysportspark.com) — you'll add DNS records for the host and for email.

---

## 2. Environment variables (the complete list)

Set these in your host's dashboard (never commit them). Full annotated template:
[`.env.example`](.env.example).

| Variable | Required | Value for production |
|---|---|---|
| `DATABASE_URL` | ✅ | SQLite: `file:/data/prod.db` · Postgres: `postgresql://…?sslmode=require` |
| `AUTH_SECRET` | ✅ | output of `npx auth secret` |
| `AUTH_TRUST_HOST` | ✅ (non-Vercel) | `true` |
| `NEXT_PUBLIC_SITE_URL` | ✅ | `https://infinitysportspark.com` |
| `EMAIL_PROVIDER` | ✅ | `resend` |
| `RESEND_API_KEY` | ✅ | from Resend (§4) |
| `EMAIL_FROM` | ✅ | `Infinity Sports Park <no-reply@infinitysportspark.com>` |
| `LEGAL_REVIEWED` | recommended | `true` **after** an attorney approves the waiver text (until then PDFs are watermarked `DRAFT`) |
| `SMS_PROVIDER` | optional | leave `console` (phone verification is optional) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | optional | enables "Continue with Google" |
| `PAYMENTS_PROVIDER` | optional | leave `mock` until you wire Stripe (§7) |

---

## 3. Option A — Railway + SQLite (recommended, easiest)

Keeps your exact codebase. ~10 minutes.

### 3.1 Create the service
1. Go to <https://railway.app> → **New Project → Deploy from GitHub repo** → pick your repo.
2. Open the service → **Settings**:
   - **Root Directory:** `website`
   - **Build Command:** `npx prisma generate && npm run build`
   - **Start Command:** `npx prisma migrate deploy && npm run start`
   - (Next.js reads Railway's `PORT` automatically.)

### 3.2 Add a persistent volume (this is where SQLite lives)
3. Service → **Variables** tab is next; first do **Settings → Volumes → New Volume**,
   mount path **`/data`**. This disk survives redeploys.

### 3.3 Set variables
4. **Variables** tab → add everything from §2. Critically:
   ```
   DATABASE_URL=file:/data/prod.db
   AUTH_SECRET=<from npx auth secret>
   AUTH_TRUST_HOST=true
   NEXT_PUBLIC_SITE_URL=https://infinitysportspark.com
   EMAIL_PROVIDER=resend
   RESEND_API_KEY=<from §4>
   EMAIL_FROM=Infinity Sports Park <no-reply@infinitysportspark.com>
   LEGAL_REVIEWED=false
   ```

### 3.4 First deploy + seed
5. Deploy. `prisma migrate deploy` creates the schema on the volume on first boot.
6. **Seed the initial data once** (facilities, pricing, admin user, waiver v1).
   In Railway: service → **⋯ → Shell** (or `railway run` via the CLI) and run:
   ```bash
   npm run db:seed
   ```
   > Run this **once**. Re-running may duplicate seed rows.

7. Confirm health: open `https://<railway-subdomain>/api/health` → `{"status":"ok","db":"up"}`.

### 3.5 Custom domain → §5. Backups → §6.

---

## 4. Email setup (Resend) — required for verification codes & waiver emails

Until this is done, codes/emails only print to the server log.

1. Create an account at <https://resend.com>.
2. **Domains → Add Domain → `infinitysportspark.com`.** Resend shows a set of DNS
   records — add them at your registrar:
   - **SPF** (`TXT` on the sending subdomain)
   - **DKIM** (one or more `CNAME`/`TXT`)
   - (Recommended) **DMARC**: `TXT` at `_dmarc` → `v=DMARC1; p=none; rua=mailto:you@infinitysportspark.com`
3. Wait for Resend to show the domain **Verified** (minutes to a few hours).
4. **API Keys → Create** → copy the key → set `RESEND_API_KEY` on the host.
5. Set `EMAIL_PROVIDER=resend` and `EMAIL_FROM="Infinity Sports Park <no-reply@infinitysportspark.com>"`
   (the `no-reply@` mailbox does not need to exist — it just has to be on the verified domain).
6. **Test:** sign up a test user → you should receive the verification code by email;
   sign a waiver → "Email me a copy" delivers the sealed PDF as an attachment.

How it works in code: `src/lib/email.ts` uses Resend when `EMAIL_PROVIDER=resend`
and a key is present, and **falls back to console logging** (never crashes a
booking/refund/waiver flow) if email fails.

---

## 5. Custom domain (infinitysportspark.com)

**Railway / Render / Lightsail:**
1. Host dashboard → **Settings → Domains → Add `infinitysportspark.com` and `www.infinitysportspark.com`.**
2. The host gives you a target. At your registrar:
   - `www` → **CNAME** → the host's target.
   - apex (`infinitysportspark.com`) → **ALIAS/ANAME** to the target if your
     registrar supports it; otherwise use the host's provided **A records**, or
     redirect apex → `www`.
3. TLS certificates are issued automatically once DNS resolves (minutes to ~1 hour).
4. Make sure `NEXT_PUBLIC_SITE_URL=https://infinitysportspark.com`.

**Vercel:** Project → **Domains → Add** → follow its DNS instructions (it manages the cert).

---

## 6. Backups & data safety

Your images and signed waiver PDFs live **in the database**, so backing up the DB
backs up everything.

- **SQLite (Option A):**
  - Simple: periodically download `/data/prod.db` (Railway shell → `sqlite3 /data/prod.db ".backup /data/backup.db"` then copy off-box).
  - Better: add a **Litestream** sidecar to stream the SQLite file continuously to
    an S3/B2 bucket (point-in-time recovery). See <https://litestream.io>.
- **Postgres (Option B/C):** Neon/Supabase/RDS all provide automated daily backups
  and point-in-time restore — enable them in the provider dashboard.
- **Retention note:** signed waivers are legal records. Keep backups for **years**,
  not days, and never hard-delete signature/PDF rows (the schema is append-only).

---

## 7. Going fully live — remaining decisions

- **Payments:** `PAYMENTS_PROVIDER=mock` today (checkout succeeds without charging).
  To take real money, wire Stripe in `src/lib/` (keys: `STRIPE_SECRET_KEY`,
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`) and set
  `PAYMENTS_PROVIDER=stripe`. **Refund actions should then also call Stripe refunds.**
- **Legal:** set `LEGAL_REVIEWED=true` only after an attorney approves the waiver +
  legal page text. Until then everything is watermarked `DRAFT`.
- **First admin:** the seed creates an admin. Change its password immediately, or
  promote your own account (Admin → Users → set role `ADMIN`).

---

## 8. Security — what's enabled, and your checklist

**Already enforced in code / config:**
- ✅ **HTTPS + HSTS** — hosts terminate TLS; `Strict-Transport-Security` header
  set for 2 years incl. subdomains (`next.config.ts`).
- ✅ **Security headers** on every route (`next.config.ts`): Content-Security-Policy
  (`frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'`,
  `upgrade-insecure-requests`), `X-Frame-Options: DENY`, `X-Content-Type-Options:
  nosniff`, `Referrer-Policy`, `Permissions-Policy`, and `X-Powered-By` removed.
- ✅ **Secure session cookies** — Auth.js v5 issues httpOnly, `SameSite=Lax`,
  `__Secure-` cookies in production. Requires `AUTH_SECRET` (and `AUTH_TRUST_HOST=true`
  behind a proxy).
- ✅ **Password hashing** — bcrypt (`src/lib/auth.ts`).
- ✅ **Server-side authorization** — `requireUser` / `requireStaff` / `requireAdmin`
  guard every protected action; the session callback **re-checks the account each
  request**, so deactivating a user or changing a role takes effect immediately.
- ✅ **Input validation** — Zod schemas on server actions and API routes.
- ✅ **Double-booking safety** — enforced by a DB unique constraint, not app logic.
- ✅ **Waivers** — append-only, versioned; each signature seals an immutable PDF +
  SHA-256 hash with ESIGN/UETA consent captured (tamper-evident).
- ✅ **Refunds** — append-only audit trail with per-user refund caps.
- ✅ **Secrets** — `.env*` is gitignored; only `.env.example` is committed.

**Your checklist before/after launch:**
- [ ] Set a strong, unique `AUTH_SECRET` in the host (never reuse the dev value).
- [ ] `EMAIL_FROM` on the verified domain; DMARC record added (§4).
- [ ] Change the seeded admin password; keep admin accounts to a minimum.
- [ ] Enable database backups (§6) and verify a test restore.
- [ ] **Rate limiting** on `/login`, `/signup`, `/verify` — not built in. Easiest:
      enable your host's/CDN's WAF rate rules, or add
      [Upstash Ratelimit](https://github.com/upstash/ratelimit) in a middleware.
      (Recommended before public launch to blunt credential-stuffing / code-guessing.)
- [ ] Postgres path: create a **least-privilege** DB user (not the superuser) for the app.
- [ ] Run `npm audit` periodically and keep `next`/`next-auth`/`prisma` patched.
- [ ] Confirm `LEGAL_REVIEWED=true` only after legal sign-off.

---

## Option B — Vercel + Neon Postgres (scales, needs a one-time switch)

Vercel is serverless: its filesystem is ephemeral, so **SQLite can't be used** —
you move to managed Postgres. One-time code change, then git-push deploys forever.

### B.1 Create the database
1. <https://neon.tech> → new project → copy the **pooled** connection string
   (`postgresql://…?sslmode=require`).

### B.2 Switch the app to Postgres (one time)
2. Install the Postgres adapter:
   ```bash
   cd website
   npm install @prisma/adapter-pg pg
   ```
3. `prisma/schema.prisma` → change the datasource provider:
   ```prisma
   datasource db {
     provider = "postgresql"
   }
   ```
4. Replace `src/lib/prisma.ts` with a scheme-aware client (works for both dev SQLite
   and prod Postgres):
   ```ts
   import { PrismaClient } from "@/generated/prisma/client";

   const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

   function createClient() {
     const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
     if (url.startsWith("postgres")) {
       // Lazy require so the SQLite dev path doesn't need pg installed.
       const { PrismaPg } = require("@prisma/adapter-pg");
       return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
     }
     const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
     return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
   }

   export const prisma = globalForPrisma.prisma ?? createClient();
   if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
   ```
5. Create the schema on Neon directly from the schema (avoids replaying
   SQLite-flavored migrations on Postgres):
   ```bash
   DATABASE_URL="postgresql://…?sslmode=require" npx prisma db push
   DATABASE_URL="postgresql://…?sslmode=require" npm run db:seed
   ```
   The `Bytes` columns (media, waiver PDFs) become Postgres `bytea` automatically —
   BLOB storage keeps working.

### B.3 Deploy on Vercel
6. <https://vercel.com> → **Import** the GitHub repo → set **Root Directory =
   `website`**.
7. Add all env vars from §2 (use the Neon URL; **omit** `AUTH_TRUST_HOST` — Vercel
   sets the host). Add **Build Command** `prisma generate && next build` if Vercel
   doesn't detect it.
8. Deploy → add the domain (§5, Vercel variant).

> Commit the Option B changes on a branch so you can keep SQLite for local dev if you
> prefer, or move local dev to a Neon dev branch too for dev/prod parity.

---

## Option C — AWS (Lightsail)

If you must stay in AWS, the low-friction route is **Lightsail Containers**:

1. Build/push the app as a container (add a `Dockerfile` running `next build` +
   `next start`), or use **Lightsail's "Deploy from image"**.
2. **Database:** create a **Lightsail Managed Database (PostgreSQL)** or small **RDS
   Postgres**, then apply the **Option B** Postgres switch and set `DATABASE_URL` to
   the RDS endpoint (`?sslmode=require`).
3. Set all env vars (§2) in the container service configuration.
4. Lightsail issues TLS and gives you domain-attach + DNS instructions (§5).
5. Backups: enable RDS/Managed-DB automated snapshots (§6).

AWS Amplify Hosting also works but is likewise serverless (Postgres required, same
Option B switch). EC2 + Nginx + PM2 is possible but is the most operational work and
is not recommended for "easy + low cost."

---

## Quick smoke test after any deploy

1. `GET /api/health` → `{"status":"ok","db":"up"}`
2. Sign up → receive the email verification code.
3. Book a field (multi-day / multi-ground) → confirmation renders.
4. Sign the waiver (consent box) → **Download PDF** works; **Email me a copy**
   delivers the attachment; `emailed` date shows.
5. Admin → Refunds: issue a small refund → appears in the audit log.
6. Admin → Waiver: publish v2 → users are prompted to re-sign.
