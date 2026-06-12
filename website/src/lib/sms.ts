import { config } from "@/lib/config";

/**
 * SMS provider abstraction.
 *
 * SMS_PROVIDER="console" → messages print to the server console (dev default).
 * SMS_PROVIDER="twilio"  → real SMS via Twilio (README §SMS).
 *
 * Note: US A2P 10DLC registration is required before Twilio can send to US
 * numbers — start that early, it takes 1–2 weeks.
 */
export async function sendSms(input: { to: string; body: string }): Promise<void> {
  if (config.smsProvider === "twilio" && process.env.TWILIO_ACCOUNT_SID) {
    // TODO(twilio): npm install twilio, then:
    // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    // await client.messages.create({ from: process.env.TWILIO_FROM_NUMBER!, ...input });
    console.warn("[sms] Twilio selected but not yet wired — logging instead.");
  }
  console.log(`\n[sms] To: ${input.to}\n[sms] ${input.body}\n`);
}
