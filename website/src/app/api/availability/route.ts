import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAvailability } from "@/lib/availability";

const querySchema = z.object({
  resourceId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    resourceId: request.nextUrl.searchParams.get("resourceId"),
    date: request.nextUrl.searchParams.get("date"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const slots = await getAvailability(parsed.data.resourceId, parsed.data.date);
  return NextResponse.json(
    { slots },
    { headers: { "Cache-Control": "no-store" } }
  );
}
