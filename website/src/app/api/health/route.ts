import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Lightweight liveness/readiness probe for uptime monitors and host health
// checks. Verifies the process is up AND the database is reachable.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return NextResponse.json({ status: "ok", db: "up" });
  } catch {
    return NextResponse.json({ status: "error", db: "down" }, { status: 503 });
  }
}
