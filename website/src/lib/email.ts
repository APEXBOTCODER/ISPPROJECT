import { config } from "@/lib/config";

export interface EmailAttachment {
  filename: string;
  content: Uint8Array;
  contentType: string;
}

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
  attachments?: EmailAttachment[];
}): Promise<void> {
  if (config.emailProvider === "resend" && process.env.RESEND_API_KEY) {
    // TODO(resend): npm install resend, then:
    // const resend = new Resend(process.env.RESEND_API_KEY);
    // await resend.emails.send({
    //   from: process.env.EMAIL_FROM!,
    //   to: input.to, subject: input.subject, text: input.text,
    //   attachments: input.attachments?.map((a) => ({
    //     filename: a.filename,
    //     content: Buffer.from(a.content).toString("base64"),
    //   })),
    // });
    console.warn("[email] Resend selected but not yet wired — logging instead.");
  }

  const attachmentLog = (input.attachments ?? [])
    .map((a) => `\n[email] attachment: ${a.filename} (${a.content.byteLength} bytes, ${a.contentType})`)
    .join("");

  console.log(
    `\n[email] To: ${input.to}\n[email] Subject: ${input.subject}\n${input.text}${attachmentLog}\n`
  );
}
