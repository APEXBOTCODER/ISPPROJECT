import { randomUUID } from "crypto";
import { config } from "@/lib/config";

export type PaymentResult =
  | { ok: true; ref: string; provider: "mock" | "stripe" }
  | { ok: false; error: string };

/**
 * Payment provider abstraction — the single place where money is taken.
 *
 * PAYMENTS_PROVIDER="mock"   → simulated success, booking confirms instantly.
 * PAYMENTS_PROVIDER="stripe" → real Stripe (wire-up steps in README §Stripe).
 *
 * The booking flow does not know or care which provider is active.
 */
export async function processPayment(input: {
  amountCents: number;
  description: string;
  customerEmail: string;
}): Promise<PaymentResult> {
  if (config.paymentsProvider === "stripe") {
    if (!process.env.STRIPE_SECRET_KEY) {
      return {
        ok: false,
        error:
          "Stripe is selected but STRIPE_SECRET_KEY is not set. See README §Stripe to finish the integration, or set PAYMENTS_PROVIDER=mock.",
      };
    }
    // TODO(stripe): replace with Stripe Checkout Session + webhook confirmation.
    // npm install stripe — then create a Checkout Session here, return its URL,
    // and confirm the booking in /api/webhooks/stripe on checkout.session.completed.
    return {
      ok: false,
      error: "Stripe integration is scaffolded but not yet wired. See README §Stripe.",
    };
  }

  // Mock provider: always succeeds, never charges anyone.
  return { ok: true, ref: `MOCK-${randomUUID()}`, provider: "mock" };
}

/** Refunds follow the same toggle. Mock refunds always succeed. */
export async function processRefund(input: {
  paymentRef: string;
  amountCents: number;
}): Promise<PaymentResult> {
  if (config.paymentsProvider === "stripe") {
    return {
      ok: false,
      error: "Stripe refunds not yet wired. See README §Stripe.",
    };
  }
  return { ok: true, ref: `MOCK-REFUND-${input.paymentRef}`, provider: "mock" };
}
