import { Resend } from "resend";
import { config } from "@/lib/config";

export interface EmailAttachment {
  filename: string;
  content: Uint8Array;
  contentType: string;
}

// Reuse a single Resend client across invocations.
let resendClient: Resend | null = null;
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

function logEmail(input: { to: string; subject: string; text: string; attachments?: EmailAttachment[] }) {
  const attachmentLog = (input.attachments ?? [])
    .map((a) => `\n[email] attachment: ${a.filename} (${a.content.byteLength} bytes, ${a.contentType})`)
    .join("");
  console.log(
    `\n[email] To: ${input.to}\n[email] Subject: ${input.subject}\n${input.text}${attachmentLog}\n`
  );
}

/**
 * Email provider abstraction.
 *
 * EMAIL_PROVIDER="console" → emails print to the server console (dev default).
 * EMAIL_PROVIDER="resend"  → real delivery via Resend. Requires RESEND_API_KEY
 *   and EMAIL_FROM (a verified sender on your Resend-verified domain).
 *   See DEPLOYMENT.md §Email.
 */
export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  attachments?: EmailAttachment[];
}): Promise<void> {
  const resend = config.emailProvider === "resend" ? getResend() : null;

  if (!resend) {
    if (config.emailProvider === "resend") {
      console.warn("[email] EMAIL_PROVIDER=resend but RESEND_API_KEY is unset — logging instead.");
    }
    logEmail(input);
    return;
  }

  const from = process.env.EMAIL_FROM;
  if (!from) {
    console.error("[email] EMAIL_FROM is not set — cannot send via Resend. Logging instead.");
    logEmail(input);
    return;
  }

  try {
    const { error } = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content),
        contentType: a.contentType,
      })),
    });
    if (error) {
      // Never let a mail failure crash a booking/refund/waiver flow.
      console.error("[email] Resend error:", error);
    }
  } catch (err) {
    console.error("[email] Resend threw:", err);
  }
}
