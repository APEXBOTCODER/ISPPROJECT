import { createHash, randomInt } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import { config } from "@/lib/config";

export type Channel = "EMAIL" | "PHONE";

const CODE_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export type IssueResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Generate a 6-digit code, replace any previous code on the channel, and
 * deliver it via email or SMS. Enforces a resend cooldown.
 */
export async function issueVerificationCode(
  userId: string,
  channel: Channel
): Promise<IssueResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, error: "Account not found." };
  if (channel === "PHONE" && !user.phone) {
    return { ok: false, error: "Add a phone number to your profile first." };
  }

  const latest = await prisma.verificationCode.findFirst({
    where: { userId, channel },
    orderBy: { createdAt: "desc" },
  });
  if (
    latest &&
    Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_SECONDS * 1000
  ) {
    return {
      ok: false,
      error: `Please wait a minute before requesting another code.`,
    };
  }

  const code = String(randomInt(100000, 1000000));

  await prisma.$transaction([
    // One active code per channel — older codes become invalid
    prisma.verificationCode.deleteMany({ where: { userId, channel } }),
    prisma.verificationCode.create({
      data: {
        userId,
        channel,
        codeHash: hashCode(code),
        expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
      },
    }),
  ]);

  if (channel === "EMAIL") {
    await sendEmail({
      to: user.email,
      subject: `${code} is your Infinity Sports Park verification code`,
      text: [
        `Hi ${user.name},`,
        ``,
        `Your email verification code is: ${code}`,
        ``,
        `It expires in ${CODE_TTL_MINUTES} minutes. If you didn't request this, you can ignore this email.`,
        ``,
        `Infinity Sports Park — ${config.tagline}`,
      ].join("\n"),
    });
  } else {
    await sendSms({
      to: user.phone!,
      body: `${code} is your Infinity Sports Park verification code. Expires in ${CODE_TTL_MINUTES} minutes.`,
    });
  }

  return { ok: true };
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; error: string };

/** Check a submitted code; on success stamp emailVerified/phoneVerified. */
export async function verifyCode(
  userId: string,
  channel: Channel,
  submitted: string
): Promise<VerifyResult> {
  const record = await prisma.verificationCode.findFirst({
    where: { userId, channel, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    return { ok: false, error: "No active code — request a new one." };
  }
  if (record.expiresAt < new Date()) {
    return { ok: false, error: "That code has expired — request a new one." };
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: "Too many attempts — request a new code." };
  }

  if (hashCode(submitted.trim()) !== record.codeHash) {
    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, error: "Incorrect code — please check and try again." };
  }

  await prisma.$transaction([
    prisma.verificationCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: userId },
      data:
        channel === "EMAIL"
          ? { emailVerified: new Date() }
          : { phoneVerified: new Date() },
    }),
  ]);

  return { ok: true };
}

/** Booking gate: email must be verified (phone is optional). */
export async function hasVerifiedEmail(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true },
  });
  return Boolean(user?.emailVerified);
}
