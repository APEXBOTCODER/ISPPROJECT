import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { findActiveCode, alreadyRedeemed } from "@/lib/discounts";

/** Validate a discount code for the signed-in user. The booking action
 *  re-validates authoritatively at submit — this is just for the live preview. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Please sign in." }, { status: 401 });
  }
  const raw = new URL(req.url).searchParams.get("code") ?? "";
  const code = await findActiveCode(raw);
  if (!code) {
    return NextResponse.json({ ok: false, error: "That code isn't valid." }, { headers: { "Cache-Control": "no-store" } });
  }
  if (code.oncePerUser && (await alreadyRedeemed(session.user.id, code.code))) {
    return NextResponse.json({ ok: false, error: "You've already used this code." }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(
    {
      ok: true,
      code: code.code,
      kind: code.kind,
      amountCents: code.amountCents,
      description: code.description ?? "",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
