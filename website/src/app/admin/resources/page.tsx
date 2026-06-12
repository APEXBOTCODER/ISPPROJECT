import Link from "next/link";
import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  createResource,
  deleteResource,
  toggleResourceActive,
  updateResource,
} from "./actions";

export const metadata = { title: "Admin · Facilities" };
export const dynamic = "force-dynamic";

const sportOptions = [
  { value: "CRICKET", label: "Cricket" },
  { value: "SOCCER", label: "Soccer" },
  { value: "NETS", label: "Practice Nets" },
  { value: "TRAINING", label: "Training" },
];

const inputCls =
  "mt-1 w-full rounded-md border border-navy/20 px-2.5 py-1.5 text-sm focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30";
const labelCls = "block text-xs font-semibold uppercase tracking-wide text-navy/60";

function ResourceFields({
  defaults,
}: {
  defaults?: {
    name: string;
    sport: string;
    description: string;
    openHour: number;
    closeHour: number;
    baseRate: number;
    peakRate: number;
    sortOrder: number;
  };
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-6">
      <div className="sm:col-span-3">
        <label className={labelCls}>
          Name
          <input name="name" required defaultValue={defaults?.name} className={inputCls} />
        </label>
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>
          Sport
          <select name="sport" required defaultValue={defaults?.sport ?? "CRICKET"} className={inputCls}>
            {sportOptions.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div>
        <label className={labelCls}>
          Sort
          <input name="sortOrder" type="number" min={0} max={999} defaultValue={defaults?.sortOrder ?? 0} className={inputCls} />
        </label>
      </div>
      <div className="sm:col-span-6">
        <label className={labelCls}>
          Description (shown to customers)
          <textarea name="description" required rows={2} defaultValue={defaults?.description} className={inputCls} />
        </label>
      </div>
      <div>
        <label className={labelCls}>
          Opens
          <select name="openHour" defaultValue={defaults?.openHour ?? 7} className={inputCls}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{h}:00</option>
            ))}
          </select>
        </label>
      </div>
      <div>
        <label className={labelCls}>
          Closes
          <select name="closeHour" defaultValue={defaults?.closeHour ?? 22} className={inputCls}>
            {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
              <option key={h} value={h}>{h}:00</option>
            ))}
          </select>
        </label>
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>
          Off-peak $/hr
          <input
            name="baseRate"
            type="number"
            step="0.01"
            min={0}
            required
            defaultValue={defaults ? (defaults.baseRate / 100).toFixed(2) : undefined}
            className={inputCls}
          />
        </label>
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>
          Peak $/hr (wkday 5pm+ &amp; weekends)
          <input
            name="peakRate"
            type="number"
            step="0.01"
            min={0}
            required
            defaultValue={defaults ? (defaults.peakRate / 100).toFixed(2) : undefined}
            className={inputCls}
          />
        </label>
      </div>
    </div>
  );
}

export default async function AdminResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  await requireStaff();
  const { error, ok } = await searchParams;

  const resources = await prisma.resource.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { bookings: true } } },
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-4xl text-navy">Admin · Facilities</h1>
        <Link href="/admin" className="text-sm font-semibold text-sky hover:underline">
          ← Back to operations
        </Link>
      </div>
      <p className="mt-2 text-sm text-navy/60">
        Changes apply immediately to the booking page, facilities page, and pricing
        table. Deactivate (don&apos;t delete) anything with booking history.
      </p>

      {ok && (
        <p className="mt-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800 ring-1 ring-green-200">{ok}</p>
      )}
      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>
      )}

      {/* Add new */}
      <section className="mt-8 rounded-2xl border-2 border-dashed border-pitch/40 p-5">
        <h2 className="display text-2xl text-navy">Add a facility</h2>
        <form action={createResource} className="mt-4 space-y-4">
          <ResourceFields />
          <button className="btn-brand rounded-md px-5 py-2 text-sm font-bold uppercase">
            Add facility
          </button>
        </form>
      </section>

      {/* Existing */}
      <section className="mt-10 space-y-6">
        {resources.map((r) => (
          <div
            key={r.id}
            className={`rounded-2xl border p-5 ${r.active ? "border-navy/10" : "border-navy/10 bg-navy/[0.04] opacity-80"}`}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="display text-xl text-navy">{r.name}</h3>
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={`rounded-full px-2.5 py-0.5 font-semibold ring-1 ${
                    r.active
                      ? "bg-green-50 text-green-700 ring-green-200"
                      : "bg-amber-50 text-amber-700 ring-amber-200"
                  }`}
                >
                  {r.active ? "Bookable" : "Hidden"}
                </span>
                <span className="text-navy/50">{r._count.bookings} booking(s) on record</span>
              </div>
            </div>

            <form action={updateResource} className="space-y-4">
              <input type="hidden" name="id" value={r.id} />
              <ResourceFields defaults={r} />
              <button className="btn-brand rounded-md px-5 py-2 text-sm font-bold uppercase">
                Save changes
              </button>
            </form>

            {/* Separate forms — HTML forbids nesting them inside the edit form */}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-navy/10 pt-3">
              <form action={toggleResourceActive}>
                <input type="hidden" name="id" value={r.id} />
                <button className="rounded-md border border-navy/20 px-4 py-1.5 text-xs font-semibold text-navy hover:bg-navy/5">
                  {r.active ? "Deactivate (hide from booking)" : "Activate"}
                </button>
              </form>
              <form action={deleteResource}>
                <input type="hidden" name="id" value={r.id} />
                <button
                  className="rounded-md border border-red-200 px-4 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={r._count.bookings > 0}
                  title={
                    r._count.bookings > 0
                      ? "Has booking history — deactivate instead"
                      : "Permanently delete"
                  }
                >
                  Delete
                </button>
              </form>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
