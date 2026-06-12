"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { issueVerificationCode, verifyCode, type Channel } from "@/lib/verification";

function backTo(next: string, params: Record<string, string>): never {
  const query = new URLSearchParams({ next, ...params });
  redirect(`/verify?${query.toString()}`);
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

const codeSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code");

export async function submitCodeAction(formData: FormData) {
  const userId = await requireUserId();
  const next = String(formData.get("next") || "/dashboard");
  const channel = (formData.get("channel") === "PHONE" ? "PHONE" : "EMAIL") as Channel;

  const parsed = codeSchema.safeParse(String(formData.get("code") ?? "").trim());
  if (!parsed.success) {
    backTo(next, { error: parsed.error.issues[0].message, channel });
  }

  const result = await verifyCode(userId, channel, parsed.data);
  if (!result.ok) {
    backTo(next, { error: result.error, channel });
  }

  backTo(next, {
    ok: channel === "EMAIL" ? "Email verified — you're all set!" : "Phone verified!",
  });
}

export async function resendCodeAction(formData: FormData) {
  const userId = await requireUserId();
  const next = String(formData.get("next") || "/dashboard");
  const channel = (formData.get("channel") === "PHONE" ? "PHONE" : "EMAIL") as Channel;

  const result = await issueVerificationCode(userId, channel);
  backTo(
    next,
    result.ok
      ? { ok: `A new code is on its way to your ${channel === "EMAIL" ? "inbox" : "phone"}.`, channel }
      : { error: result.error, channel }
  );
}

const phoneSchema = z
  .string()
  .min(10, "Enter a valid phone number")
  .max(20)
  .regex(/^[+()\-\s\d]+$/, "Enter a valid phone number");

/** Save/replace the phone number and immediately send a verification code. */
export async function updatePhoneAction(formData: FormData) {
  const userId = await requireUserId();
  const next = String(formData.get("next") || "/dashboard");

  const parsed = phoneSchema.safeParse(String(formData.get("phone") ?? "").trim());
  if (!parsed.success) {
    backTo(next, { error: parsed.error.issues[0].message, channel: "PHONE" });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { phone: parsed.data, phoneVerified: null },
  });

  const result = await issueVerificationCode(userId, "PHONE");
  backTo(
    next,
    result.ok
      ? { ok: "Code sent to your phone.", channel: "PHONE" }
      : { error: result.error, channel: "PHONE" }
  );
}
