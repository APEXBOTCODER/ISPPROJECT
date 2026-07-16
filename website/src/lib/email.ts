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

type EmailInput = {
  to: string;
  subject: string;
  text: string;
  attachments?: EmailAttachment[];
};

/**
 * Send via Amazon SES. Uses nodemailer to build a raw MIME message so
 * attachments (the sealed waiver PDF) are supported, then hands it to SES's
 * SendRawEmail. Credentials come from the standard AWS chain (env vars or the
 * instance's IAM role); region from AWS_REGION. See DEPLOYMENT.md §"All-AWS".
 */
async function sendViaSes(input: EmailInput, from: string): Promise<void> {
  const [{ SES, SendRawEmailCommand }, nodemailer] = await Promise.all([
    import("@aws-sdk/client-ses"),
    import("nodemailer"),
  ]);
  const ses = new SES({ region: process.env.AWS_REGION });
  // nodemailer's TS types omit the SES transport from createTransport's
  // overloads, though it is fully supported at runtime.
  const transporter = nodemailer.default.createTransport({
    SES: { ses, aws: { SendRawEmailCommand } },
  } as unknown as Parameters<typeof nodemailer.default.createTransport>[0]);
  await transporter.sendMail({
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
}

/**
 * Email provider abstraction.
 *
 * EMAIL_PROVIDER="console" → emails print to the server console (dev default).
 * EMAIL_PROVIDER="resend"  → real delivery via Resend (needs RESEND_API_KEY).
 * EMAIL_PROVIDER="ses"     → real delivery via Amazon SES (needs AWS_REGION +
 *   AWS credentials/role). Both require EMAIL_FROM to be a verified sender on
 *   your verified domain. See DEPLOYMENT.md §Email.
 *
 * A send failure is logged, never thrown — it must not crash a booking/refund/
 * waiver flow.
 */
export async function sendEmail(input: EmailInput): Promise<void> {
  const from = process.env.EMAIL_FROM;

  if (config.emailProvider === "ses") {
    if (!from) {
      console.error("[email] EMAIL_FROM is not set — cannot send via SES. Logging instead.");
      logEmail(input);
      return;
    }
    try {
      await sendViaSes(input, from);
    } catch (err) {
      console.error("[email] SES error:", err);
    }
    return;
  }

  const resend = config.emailProvider === "resend" ? getResend() : null;
  if (!resend) {
    if (config.emailProvider === "resend") {
      console.warn("[email] EMAIL_PROVIDER=resend but RESEND_API_KEY is unset — logging instead.");
    }
    logEmail(input);
    return;
  }
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
    if (error) console.error("[email] Resend error:", error);
  } catch (err) {
    console.error("[email] Resend threw:", err);
  }
}
