"use server";

import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SETTING_FIELDS } from "@/lib/settings";

export async function saveSettings(formData: FormData) {
  await requireStaff();

  for (const field of SETTING_FIELDS) {
    let value: string;
    if (field.type === "boolean") {
      // Unchecked checkboxes are absent from FormData.
      value = formData.get(field.key) ? "true" : "false";
    } else {
      value = String(formData.get(field.key) ?? "").trim();
    }

    await prisma.siteSetting.upsert({
      where: { key: field.key },
      create: { key: field.key, value },
      update: { value },
    });
  }

  redirect("/admin/content?ok=" + encodeURIComponent("Site content saved."));
}
