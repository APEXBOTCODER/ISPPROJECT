"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { POLICY_FIELDS } from "@/lib/policy";

export async function savePolicy(formData: FormData) {
  await requireAdmin();

  for (const field of POLICY_FIELDS) {
    const raw = String(formData.get(field.key) ?? "").trim();
    const n = parseInt(raw, 10);
    if (Number.isNaN(n) || n < field.min || n > field.max) continue;
    await prisma.siteSetting.upsert({
      where: { key: `policy.${field.key}` },
      create: { key: `policy.${field.key}`, value: String(n) },
      update: { value: String(n) },
    });
  }

  redirect("/admin/settings?ok=" + encodeURIComponent("Booking policies saved."));
}
