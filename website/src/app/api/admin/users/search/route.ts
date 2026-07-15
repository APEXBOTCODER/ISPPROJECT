import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Typeahead user search for admin flows. Staff-only. Matches name OR email,
 * capped at 20 results — scales to large user tables (never enumerates all).
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "STAFF" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ users: [] });

  const users = await prisma.user.findMany({
    where: {
      // SQLite LIKE is case-insensitive for ASCII; for Postgres add mode:"insensitive".
      OR: [{ name: { contains: q } }, { email: { contains: q } }],
    },
    take: 20,
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true, emailVerified: true },
  });

  return NextResponse.json(
    { users },
    { headers: { "Cache-Control": "no-store" } }
  );
}
