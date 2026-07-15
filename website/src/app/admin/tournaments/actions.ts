"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";

const tournamentSchema = z.object({
  name: z.string().min(3, "Name is too short").max(120),
  timing: z.string().min(2, "Add a date or timeframe").max(120),
  description: z.string().min(10, "Please add a short description").max(600),
  ctaLabel: z.string().min(2).max(40),
  sortOrder: z.coerce.number().int().min(0).max(999),
});

function parseForm(formData: FormData) {
  return tournamentSchema.safeParse({
    name: formData.get("name"),
    timing: formData.get("timing"),
    description: formData.get("description"),
    ctaLabel: formData.get("ctaLabel") || "Register interest",
    sortOrder: formData.get("sortOrder"),
  });
}

function fail(message: string): never {
  redirect("/admin/tournaments?error=" + encodeURIComponent(message));
}

export async function createTournament(formData: FormData) {
  await requireStaff();
  const parsed = parseForm(formData);
  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Invalid input");

  await prisma.tournament.create({ data: parsed.data });
  redirect("/admin/tournaments?ok=" + encodeURIComponent(`"${parsed.data.name}" added.`));
}

export async function updateTournament(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const parsed = parseForm(formData);
  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Invalid input");

  const existing = await prisma.tournament.findUnique({ where: { id } });
  if (!existing) fail("Tournament not found.");

  await prisma.tournament.update({ where: { id }, data: parsed.data });
  redirect("/admin/tournaments?ok=" + encodeURIComponent(`"${parsed.data.name}" saved.`));
}

/** Hide from the public page without deleting. */
export async function toggleTournamentActive(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const t = await prisma.tournament.findUnique({ where: { id } });
  if (!t) fail("Tournament not found.");

  await prisma.tournament.update({ where: { id }, data: { active: !t.active } });
  redirect(
    "/admin/tournaments?ok=" +
      encodeURIComponent(`"${t.name}" is now ${t.active ? "hidden" : "published"}.`)
  );
}

export async function deleteTournament(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const t = await prisma.tournament.findUnique({ where: { id } });
  if (!t) fail("Tournament not found.");

  await prisma.tournament.delete({ where: { id } });
  redirect("/admin/tournaments?ok=" + encodeURIComponent(`"${t.name}" deleted.`));
}
