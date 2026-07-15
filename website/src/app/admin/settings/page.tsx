import { requireAdmin } from "@/lib/session";
import { getBookingPolicy, POLICY_FIELDS } from "@/lib/policy";
import { savePolicy } from "./actions";

export const metadata = { title: "Admin · Settings" };
export const dynamic = "force-dynamic";

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  await requireAdmin();
  const { ok } = await searchParams;
  const policy = await getBookingPolicy();

  return (
    <div className="max-w-2xl">
      <h1 className="display text-4xl text-navy">Settings</h1>
      <p className="mt-2 text-sm text-navy/60">
        Booking &amp; cancellation policy. Changes apply immediately across the booking
        flow and refunds. (Admin-only.)
      </p>

      {ok && (
        <p className="mt-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800 ring-1 ring-green-200">{ok}</p>
      )}

      <form action={savePolicy} className="mt-6 space-y-4">
        {POLICY_FIELDS.map((f) => (
          <div key={f.key} className="rounded-2xl border border-navy/10 p-4">
            <label className="block">
              <span className="block text-sm font-semibold text-navy">{f.label}</span>
              <span className="block text-xs text-navy/60">{f.help}</span>
              <input
                type="number"
                name={f.key}
                min={f.min}
                max={f.max}
                defaultValue={policy[f.key]}
                className="mt-2 w-32 rounded-md border border-navy/20 px-3 py-2 text-sm focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30"
              />
              <span className="ml-2 text-xs text-navy/40">({f.min}–{f.max})</span>
            </label>
          </div>
        ))}
        <button className="btn-brand rounded-md px-6 py-2.5 text-sm font-bold uppercase">
          Save policies
        </button>
      </form>
    </div>
  );
}
