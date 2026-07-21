import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/pricing";
import { createDiscount, toggleDiscount, deleteDiscount } from "./actions";

export const metadata = { title: "Admin · Discount codes" };
export const dynamic = "force-dynamic";

export default async function AdminDiscountsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireStaff();
  const { ok, error } = await searchParams;
  const codes = await prisma.discountCode.findMany({ orderBy: { createdAt: "desc" } });

  const kindLabel = (c: { kind: string; amountCents: number }) =>
    c.kind === "PER_HOUR"
      ? `${formatCents(c.amountCents)} / hour`
      : `${formatCents(c.amountCents)} / reservation`;

  const inputCls =
    "mt-1 w-full rounded-md border border-navy/20 px-3 py-2 text-sm focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30";

  return (
    <div>
      <h1 className="display text-4xl text-navy">Discount codes</h1>
      <p className="mt-2 text-sm text-navy/60">
        Codes customers can enter at checkout. Per-hour codes discount every booked hour (e.g. a club
        rate); per-reservation codes take a flat amount off the whole reservation. Disable a code to
        stop it working without deleting its history.
      </p>

      {ok && <p className="mt-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800 ring-1 ring-green-200">{ok}</p>}
      {error && <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      {/* Create */}
      <section className="mt-6 rounded-2xl border border-navy/10 p-5">
        <h2 className="display text-xl text-navy">Add a code</h2>
        <form action={createDiscount} className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-navy">
            Code
            <input name="code" required placeholder="ACCPLAYER" className={`${inputCls} uppercase`} />
          </label>
          <label className="block text-sm font-medium text-navy">
            Description <span className="font-normal text-navy/50">(optional)</span>
            <input name="description" placeholder="Argyle Cricket Club players" className={inputCls} />
          </label>
          <label className="block text-sm font-medium text-navy">
            Type
            <select name="kind" className={inputCls} defaultValue="PER_HOUR">
              <option value="PER_HOUR">Per hour (off every booked hour)</option>
              <option value="PER_RESERVATION">Per reservation (flat)</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-navy">
            Discount amount (USD)
            <input name="amount" type="number" step="0.01" min="0.01" required placeholder="5.00" className={inputCls} />
          </label>
          <label className="flex items-center gap-2 text-sm text-navy sm:col-span-2">
            <input type="checkbox" name="oncePerUser" className="h-4 w-4 rounded border-navy/30" />
            One-time per user (e.g. a new-customer code)
          </label>
          <div className="sm:col-span-2">
            <button className="btn-brand rounded-md px-5 py-2.5 text-sm font-bold uppercase">Add code</button>
          </div>
        </form>
        <p className="mt-3 text-xs text-navy/50">
          Examples: <strong>ACCPLAYER</strong> — per hour, $5.00 (Argyle Cricket Club). <strong>NEWUSER</strong> — per
          reservation, $10.00, one-time per user.
        </p>
      </section>

      {/* List */}
      <section className="mt-8">
        <h2 className="display text-2xl text-navy">All codes</h2>
        {codes.length === 0 ? (
          <p className="mt-3 text-sm text-navy/60">No codes yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-navy/15 text-xs uppercase text-navy/50">
                  <th className="py-2 pr-4">Code</th>
                  <th className="py-2 pr-4">Discount</th>
                  <th className="py-2 pr-4">Scope</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => (
                  <tr key={c.id} className="border-b border-navy/5">
                    <td className="py-2.5 pr-4">
                      <span className="font-mono font-bold text-navy">{c.code}</span>
                      {c.description && <span className="block text-xs text-navy/50">{c.description}</span>}
                    </td>
                    <td className="py-2.5 pr-4">{kindLabel(c)}</td>
                    <td className="py-2.5 pr-4 text-navy/70">{c.oncePerUser ? "One-time / user" : "Reusable"}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${c.active ? "bg-green-50 text-green-700 ring-green-200" : "bg-navy/5 text-navy/50 ring-navy/10"}`}>
                        {c.active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <form action={toggleDiscount}>
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="active" value={c.active ? "false" : "true"} />
                          <button className="rounded-md border border-navy/20 px-3 py-1.5 text-xs font-semibold text-navy hover:bg-navy/5">
                            {c.active ? "Disable" : "Enable"}
                          </button>
                        </form>
                        <form action={deleteDiscount}>
                          <input type="hidden" name="id" value={c.id} />
                          <button className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">
                            Delete
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
