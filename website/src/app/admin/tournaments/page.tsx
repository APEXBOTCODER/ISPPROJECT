import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  createTournament,
  deleteTournament,
  toggleTournamentActive,
  updateTournament,
} from "./actions";

export const metadata = { title: "Admin · Tournaments" };
export const dynamic = "force-dynamic";

const inputCls =
  "mt-1 w-full rounded-md border border-navy/20 px-2.5 py-1.5 text-sm focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30";
const labelCls = "block text-xs font-semibold uppercase tracking-wide text-navy/60";

function TournamentFields({
  defaults,
}: {
  defaults?: {
    name: string;
    timing: string;
    description: string;
    ctaLabel: string;
    sortOrder: number;
  };
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-6">
      <div className="sm:col-span-4">
        <label className={labelCls}>
          Name
          <input name="name" required defaultValue={defaults?.name} className={inputCls} />
        </label>
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>
          Sort
          <input name="sortOrder" type="number" min={0} max={999} defaultValue={defaults?.sortOrder ?? 0} className={inputCls} />
        </label>
      </div>
      <div className="sm:col-span-4">
        <label className={labelCls}>
          Date / timeframe
          <input name="timing" required placeholder="Summer 2026 · opening weekend" defaultValue={defaults?.timing} className={inputCls} />
        </label>
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>
          Button label
          <input name="ctaLabel" defaultValue={defaults?.ctaLabel ?? "Register interest"} className={inputCls} />
        </label>
      </div>
      <div className="sm:col-span-6">
        <label className={labelCls}>
          Description (shown to visitors)
          <textarea name="description" required rows={2} defaultValue={defaults?.description} className={inputCls} />
        </label>
      </div>
    </div>
  );
}

export default async function AdminTournamentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  await requireStaff();
  const { error, ok } = await searchParams;

  const tournaments = await prisma.tournament.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return (
    <div>
      <h1 className="display text-4xl text-navy">Tournaments</h1>
      <p className="mt-2 text-sm text-navy/60">
        These appear on the public <strong>Tournaments &amp; Events</strong> page in sort order.
        Hide (don&apos;t delete) events you want to keep for later.
      </p>

      {ok && (
        <p className="mt-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800 ring-1 ring-green-200">{ok}</p>
      )}
      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>
      )}

      {/* Add new */}
      <section className="mt-8 rounded-2xl border-2 border-dashed border-pitch/40 p-5">
        <h2 className="display text-2xl text-navy">Add a tournament / event</h2>
        <form action={createTournament} className="mt-4 space-y-4">
          <TournamentFields />
          <button className="btn-brand rounded-md px-5 py-2 text-sm font-bold uppercase">
            Add event
          </button>
        </form>
      </section>

      {/* Existing */}
      <section className="mt-10 space-y-6">
        {tournaments.length === 0 && (
          <p className="text-sm text-navy/60">No events yet — add your first above.</p>
        )}
        {tournaments.map((t) => (
          <div
            key={t.id}
            className={`rounded-2xl border p-5 ${t.active ? "border-navy/10" : "border-navy/10 bg-navy/[0.04] opacity-80"}`}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="display text-xl text-navy">{t.name}</h3>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
                  t.active
                    ? "bg-green-50 text-green-700 ring-green-200"
                    : "bg-amber-50 text-amber-700 ring-amber-200"
                }`}
              >
                {t.active ? "Published" : "Hidden"}
              </span>
            </div>

            <form action={updateTournament} className="space-y-4">
              <input type="hidden" name="id" value={t.id} />
              <TournamentFields defaults={t} />
              <button className="btn-brand rounded-md px-5 py-2 text-sm font-bold uppercase">
                Save changes
              </button>
            </form>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-navy/10 pt-3">
              <form action={toggleTournamentActive}>
                <input type="hidden" name="id" value={t.id} />
                <button className="rounded-md border border-navy/20 px-4 py-1.5 text-xs font-semibold text-navy hover:bg-navy/5">
                  {t.active ? "Hide from site" : "Publish"}
                </button>
              </form>
              <form action={deleteTournament}>
                <input type="hidden" name="id" value={t.id} />
                <button className="rounded-md border border-red-200 px-4 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">
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
