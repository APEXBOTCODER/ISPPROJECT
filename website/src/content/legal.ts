// DRAFT legal content — replace each body with the attorney-approved text,
// then set LEGAL_REVIEWED=true in the environment to remove the DRAFT banners.
// (README §Legal documents)

export interface LegalDoc {
  slug: string;
  title: string;
  body: string;
}

export const legalDocs: LegalDoc[] = [
  {
    slug: "terms",
    title: "Terms of Service",
    body: `These Terms of Service govern your use of the Infinity Sports Park website and facilities.

1. BOOKINGS. Reservations are confirmed on successful payment. Slots are hourly and non-transferable without staff approval.

2. CONDUCT. Follow posted facility rules and staff instructions. The Park may refuse entry or cancel bookings (with refund) for unsafe or abusive behavior.

3. PAYMENT. Prices shown at checkout are final and include applicable taxes and fees.

4. LIABILITY. Use of athletic facilities carries inherent risk; see the Waiver & Liability document, which every participant must sign.

5. CHANGES. We may update these terms; material changes are announced on this page with a revised effective date.`,
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    body: `Your privacy matters to us.

WHAT WE COLLECT. Account details (name, email, phone), booking history, waiver signatures (including IP address and timestamp, kept for legal enforceability), and payment references. Card numbers are processed by our payment provider and never touch our servers.

HOW WE USE IT. To operate bookings, send transactional emails (confirmations, reminders, cancellations), and — only with your separate consent — occasional park news.

YOUR RIGHTS. Request a copy of your data or deletion of your account at any time via hello@infinitysportspark.com. Waiver records may be retained as required for legal purposes.

MINORS. Waivers for minors are signed by a parent or guardian; we collect only the minor's name and date of birth for that purpose.`,
  },
  {
    slug: "refunds",
    title: "Cancellation & Refund Policy",
    body: `You can cancel any booking yourself from your account dashboard.

REFUND SCHEDULE
• 48 hours or more before your slot starts — 100% refund
• 24 to 48 hours before — 50% refund
• Less than 24 hours — no refund

Refunds are issued automatically to the original payment method. Weather closures or park-initiated cancellations are always refunded in full.`,
  },
  {
    slug: "waiver",
    title: "Waiver & Liability",
    body: `Every participant must sign our electronic liability waiver before first play, and again whenever the document version changes. Parents or legal guardians sign on behalf of minors.

The full waiver text is presented during signing at /waiver. Signed records — including signer name, document version, date/time, and IP address — are stored securely and available in your account.`,
  },
];
