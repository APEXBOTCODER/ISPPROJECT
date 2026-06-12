import { config } from "@/lib/config";

/**
 * Email provider abstraction.
 *
 * EMAIL_PROVIDER="console" → emails print to the server console (dev default).
 * EMAIL_PROVIDER="resend"  → real delivery via Resend (README §Email).
 */
export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  if (config.emailProvider === "resend" && process.env.RESEND_API_KEY) {
    // TODO(resend): npm install resend, then:
    // const resend = new Resend(process.env.RESEND_API_KEY);
    // await resend.emails.send({ from: process.env.EMAIL_FROM!, ...input });
    console.warn("[email] Resend selected but not yet wired — logging instead.");
  }
  console.log(
    `\n[email] To: ${input.to}\n[email] Subject: ${input.subject}\n${input.text}\n`
  );
}
