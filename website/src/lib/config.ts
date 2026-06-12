// Central feature-flag / integration-toggle configuration.
// Every external dependency (Stripe, Resend, Google OAuth, domain, legal copy)
// has a safe local default so the site runs end-to-end with zero accounts.

export const config = {
  siteName: "Infinity Sports Park",
  tagline: "Where Passion Meets Performance",
  launchLabel: "Launching Summer 2026",
  location: "Near Argyle, Texas — 10 mins from Argyle Chowrastha",
  timezone: "America/Chicago",

  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",

  /** "mock" simulates a successful checkout; "stripe" uses real Stripe keys. */
  paymentsProvider: (process.env.PAYMENTS_PROVIDER ?? "mock") as "mock" | "stripe",

  /** "console" logs outbound email to the server console; "resend" sends real email. */
  emailProvider: (process.env.EMAIL_PROVIDER ?? "console") as "console" | "resend",

  /** "console" logs SMS to the server console; "twilio" sends real texts. */
  smsProvider: (process.env.SMS_PROVIDER ?? "console") as "console" | "twilio",

  /** Google sign-in button renders only when OAuth credentials exist. */
  googleAuthEnabled: Boolean(
    process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
  ),

  /** While false, legal pages and the waiver carry a visible DRAFT banner. */
  legalReviewed: process.env.LEGAL_REVIEWED === "true",

  /** Minutes a PENDING booking holds its slots before it is released. */
  holdMinutes: 10,

  /** How many days ahead customers may book. */
  advanceBookingDays: 60,

  cancellationPolicy: {
    fullRefundHours: 48,
    halfRefundHours: 24,
  },
} as const;
