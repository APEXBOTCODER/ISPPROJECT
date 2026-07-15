"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";

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
