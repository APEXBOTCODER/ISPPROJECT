import { config } from "@/lib/config";

function logSms(input: { to: string; body: string }) {
  console.log(`\n[sms] To: ${input.to}\n[sms] ${input.body}\n`);
}

/**
 * Send a transactional SMS via Amazon SNS. Credentials come from the standard
 * AWS chain (env vars or the instance's IAM role); region from AWS_REGION.
 * `to` must be E.164 (e.g. +19725551234). See DEPLOYMENT.md §"All-AWS".
 */
async function sendViaSns(input: { to: string; body: string }): Promise<void> {
  const { SNSClient, PublishCommand } = await import("@aws-sdk/client-sns");
  const sns = new SNSClient({ region: process.env.AWS_REGION });
  await sns.send(
    new PublishCommand({
      PhoneNumber: input.to,
      Message: input.body,
      MessageAttributes: {
        // Transactional = highest deliverability priority (e.g. auth codes).
        "AWS.SNS.SMS.SMSType": { DataType: "String", StringValue: "Transactional" },
      },
    })
  );
}

/**
 * SMS provider abstraction.
 *
 * SMS_PROVIDER="console" → messages print to the server console (dev default).
 * SMS_PROVIDER="sns"     → real SMS via Amazon SNS (needs AWS_REGION + creds/role).
 * SMS_PROVIDER="twilio"  → real SMS via Twilio (not yet wired).
 *
 * Phone verification is OPTIONAL for booking, so this can stay "console"
 * indefinitely. Note: sending to US numbers requires A2P 10DLC (SNS) or a
 * carrier-registered number — start that early, it can take 1–2 weeks.
 *
 * A send failure is logged, never thrown.
 */
export async function sendSms(input: { to: string; body: string }): Promise<void> {
  if (config.smsProvider === "sns") {
    try {
      await sendViaSns(input);
    } catch (err) {
      console.error("[sms] SNS error:", err);
    }
    return;
  }

  if (config.smsProvider === "twilio" && process.env.TWILIO_ACCOUNT_SID) {
    // TODO(twilio): npm install twilio, then:
    // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    // await client.messages.create({ from: process.env.TWILIO_FROM_NUMBER!, ...input });
    console.warn("[sms] Twilio selected but not yet wired — logging instead.");
  }
  logSms(input);
}
