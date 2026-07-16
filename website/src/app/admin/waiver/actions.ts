"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin, requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { config } from "@/lib/config";
import { getCurrentWaiver } from "@/lib/waiver";

const docSchema = z.object({
  title: z.string().min(3, "Title is too short").max(200),
  body: z.string().min(20, "Waiver text is too short").max(50000),
});

function fail(message: string): never {
  redirect("/admin/waiver?error=" + encodeURIComponent(message));
}

/** Publish a NEW waiver version (append-only). Everyone must re-sign. ADMIN-only. */
export async function publishWaiverVersion(formData: FormData) {
  await requireAdmin();
  const parsed = docSchema.safeParse({ title: formData.get("title"), body: formData.get("body") });
  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  const max = await prisma.waiverDocument.aggregate({ _max: { version: true } });
  const nextVersion = (max._max.version ?? 0) + 1;

  await prisma.$transaction([
    prisma.waiverDocument.updateMany({ where: { active: true }, data: { active: false } }),
    prisma.waiverDocument.create({
      data: { version: nextVersion, title: parsed.data.title, body: parsed.data.body, active: true },
    }),
  ]);

  redirect("/admin/waiver?ok=" + encodeURIComponent(`Published waiver v${nextVersion}. All users must re-sign it before booking.`));
}

/** Edit a waiver version in place — only allowed when it has NO signatures. ADMIN-only. */
export async function editWaiverDraft(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const parsed = docSchema.safeParse({ title: formData.get("title"), body: formData.get("body") });
  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Invalid input.");

  const doc = await prisma.waiverDocument.findUnique({
    where: { id },
    include: { _count: { select: { signatures: true } } },
  });
  if (!doc) fail("Version not found.");
  if (doc._count.signatures > 0) {
    fail("This version already has signatures and can't be edited — publish a new version instead.");
  }

  await prisma.waiverDocument.update({
    where: { id },
    data: { title: parsed.data.title, body: parsed.data.body },
  });
  redirect("/admin/waiver?ok=" + encodeURIComponent("Waiver text updated."));
}

/**
 * Email the selected signers a request to re-sign the current waiver (e.g. after
 * a new version is published). Dedupes by account so each person gets one email.
 * Staff-level; sending is best-effort and never throws. Selection is by
 * signature id (from the Signatures log checkboxes).
 */
export async function requestResign(formData: FormData) {
  await requireStaff();
  const ids = formData.getAll("sig").map(String).filter(Boolean);
  if (ids.length === 0) fail("Select at least one signer to request a re-sign.");

  const [sigs, current] = await Promise.all([
    prisma.waiverSignature.findMany({
      where: { id: { in: ids } },
      include: { user: { select: { email: true, name: true } } },
    }),
    getCurrentWaiver(),
  ]);

  // One email per unique account, even if a person has several signatures.
  const recipients = new Map<string, string>(); // email -> name
  for (const s of sigs) {
    if (s.user?.email) recipients.set(s.user.email, s.user.name);
  }
  if (recipients.size === 0) fail("The selected rows have no email on file.");

  const link = `${config.siteUrl}/waiver?next=/dashboard`;
  const versionNote = current ? ` (version ${current.version})` : "";
  for (const [email, name] of recipients) {
    await sendEmail({
      to: email,
      subject: `Action needed: please re-sign the updated waiver — ${config.siteName}`,
      text: [
        `Hi ${name},`,
        ``,
        `Our liability waiver${versionNote} has been updated. Please review and re-sign it`,
        `before your next visit or booking. It only takes a minute:`,
        ``,
        `  ${link}`,
        ``,
        `Thank you,`,
        `${config.siteName}`,
      ].join("\n"),
    });
  }

  redirect(
    "/admin/waiver?ok=" +
      encodeURIComponent(`Emailed a re-sign request to ${recipients.size} signer(s).`)
  );
}
