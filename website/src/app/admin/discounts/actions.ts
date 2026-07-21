"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { normalizeCode } from "@/lib/discounts";

const createSchema = z.object({
  code: z.string().min(2, "Code must be at least 2 characters.").max(40),
  description: z.string().max(200).optional(),
  kind: z.enum(["PER_HOUR", "PER_RESERVATION"]),
  amountCents: z.number().int().positive("Enter a discount amount above $0.").max(1_000_000),
  oncePerUser: z.boolean(),
});

function back(params: Record<string, string>): never {
  redirect("/admin/discounts?" + new URLSearchParams(params).toString());
}

export async function createDiscount(formData: FormData) {
  await requireAdmin();
  const cents = Math.round(parseFloat(String(formData.get("amount") ?? "")) * 100);
  const parsed = createSchema.safeParse({
    code: normalizeCode(String(formData.get("code") ?? "")),
    description: String(formData.get("description") ?? "").trim() || undefined,
    kind: formData.get("kind"),
    amountCents: Number.isNaN(cents) ? 0 : cents,
    oncePerUser: formData.get("oncePerUser") === "on",
  });
  if (!parsed.success) back({ error: parsed.error.issues[0]?.message ?? "Invalid input." });
  const { code, description, kind, amountCents, oncePerUser } = parsed.data;

  const existing = await prisma.discountCode.findUnique({ where: { code } });
  if (existing) back({ error: `A code named ${code} already exists.` });

  await prisma.discountCode.create({
    data: { code, description: description ?? null, kind, amountCents, oncePerUser },
  });
  back({ ok: `Created ${code}.` });
}

export async function toggleDiscount(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active")) === "true";
  if (!id) back({ error: "Code not found." });
  await prisma.discountCode.update({ where: { id }, data: { active } });
  back({ ok: active ? "Code enabled." : "Code disabled." });
}

export async function deleteDiscount(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) back({ error: "Code not found." });
  await prisma.discountCode.delete({ where: { id } });
  back({ ok: "Code deleted." });
}
