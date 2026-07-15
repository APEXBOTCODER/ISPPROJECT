import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { parkNow } from "@/lib/availability";
import MaintenanceBlockForm from "@/components/MaintenanceBlockForm";
import { createBlock, removeBlock, removeBlockGroup } from "../actions";

export const metadata = { title: "Admin · Maintenance" };
export const dynamic = "force-dynamic";

export default async function AdminMaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  await requireStaff();
  const { error, ok } = await searchParams;
  const now = parkNow();

  const [resources, blocks] = await Promise.all([
    prisma.resource.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.booking.findMany({
      where: { status: "BLOCKED", date: { gte: now.date } },
      include: { resource: true },
      orderBy: [{ date: "asc" }, { startHour: "asc" }],
    }),
  ]);

  type BlockRow = (typeof blocks)[number];
  const blockGroups = new Map<string, BlockRow[]>();
  const standaloneBlocks: BlockRow[] = [];
  for (const b of blocks) {
    if (b.reservationId) {
      const arr = blockGroups.get(b.reservationId) ?? [];
      arr.push(b);
      blockGroups.set(b.reservationId, arr);
    } else {
      standaloneBlocks.push(b);
    }
  }

  const blockMaxDate = (() => {
    const d = new Date(`${now.date}T00:00:00`);
    d.setDate(d.getDate() + 365);
    return d.toISOString().slice(0, 10);
  })();

  return (
    <div>
      <h1 className="display text-4xl text-navy">Maintenance blocks</h1>
      <p className="mt-2 text-sm text-navy/60">
        Select any days on the calendar (contiguous or not); the hour range applies to
        each. Blocked slots can&apos;t be booked by customers.
      </p>

      {ok && (
        <p className="mt-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800 ring-1 ring-green-200">{ok}</p>
      )}
      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>
      )}

      <section className="mt-6 rounded-2xl border border-navy/10 p-5">
        <MaintenanceBlockForm
          resources={resources.map((r) => ({ id: r.id, name: r.name }))}
          action={createBlock}
          minDate={now.date}
          maxDate={blockMaxDate}
        />
      </section>

      <section className="mt-6">
        <h2 className="display text-2xl text-navy">Current &amp; upcoming blocks</h2>
        {blocks.length === 0 ? (
          <p className="mt-3 text-sm text-navy/60">No maintenance blocks scheduled.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {Array.from(blockGroups.values()).map((group) => {
              const first = group[0];
              const dates = group.map((g) => g.date).sort();
              const span =
                dates.length > 1 ? `${dates[0]} → ${dates[dates.length - 1]} (${dates.length} days)` : dates[0];
              return (
                <li key={first.reservationId} className="rounded-lg bg-amber-50 px-4 py-2.5 text-sm ring-1 ring-amber-200">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <strong>{first.resource.name}</strong> · {span} · {first.startHour}:00–{first.endHour}:00
                      {first.notes ? ` · ${first.notes}` : ""}
                    </span>
                    <form action={removeBlockGroup}>
                      <input type="hidden" name="reservationId" value={first.reservationId ?? ""} />
                      <button className="rounded-md border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100">
                        {group.length > 1 ? "Remove all" : "Remove"}
                      </button>
                    </form>
                  </div>
                  {group.length > 1 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {group.map((g) => (
                        <form key={g.id} action={removeBlock}>
                          <input type="hidden" name="blockId" value={g.id} />
                          <button className="rounded-full border border-amber-300 px-2.5 py-0.5 text-xs text-amber-800 hover:bg-amber-100" title="Remove this day">
                            {g.date} ✕
                          </button>
                        </form>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
            {standaloneBlocks.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-4 py-2.5 text-sm ring-1 ring-amber-200">
                <span>
                  <strong>{b.resource.name}</strong> · {b.date} · {b.startHour}:00–{b.endHour}:00
                  {b.notes ? ` · ${b.notes}` : ""}
                </span>
                <form action={removeBlock}>
                  <input type="hidden" name="blockId" value={b.id} />
                  <button className="rounded-md border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
