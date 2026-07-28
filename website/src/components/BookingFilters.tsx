"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { FoundUser } from "@/components/UserSearch";

/**
 * Filter bar for the admin Bookings tab: narrow by user, ground, and date range,
 * then act on the results with the workbench. Applying navigates with query
 * params the server reads to filter its queries.
 */
export default function BookingFilters({
  resources,
  userId,
  userName,
  resourceId,
  from,
  to,
}: {
  resources: { id: string; name: string }[];
  userId?: string;
  userName?: string;
  resourceId?: string;
  from?: string;
  to?: string;
}) {
  const router = useRouter();
  const [user, setUser] = useState<{ id: string; name: string } | null>(
    userId && userName ? { id: userId, name: userName } : null
  );
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoundUser[]>([]);
  const [open, setOpen] = useState(false);
  const [ground, setGround] = useState(resourceId ?? "");
  const [fromDate, setFromDate] = useState(from ?? "");
  const [toDate, setToDate] = useState(to ?? "");

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { setResults([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(query)}`, { cache: "no-store" });
        const data = await res.json();
        if (!cancelled) { setResults(data.users ?? []); setOpen(true); }
      } catch {
        if (!cancelled) setResults([]);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  const apply = () => {
    const p = new URLSearchParams();
    if (user) p.set("userId", user.id);
    if (ground) p.set("resourceId", ground);
    if (fromDate) p.set("from", fromDate);
    if (toDate) p.set("to", toDate);
    router.push(`/admin/bookings${p.toString() ? `?${p.toString()}` : ""}`);
  };
  const clear = () => {
    setUser(null); setGround(""); setFromDate(""); setToDate(""); setQ("");
    router.push("/admin/bookings");
  };

  const anyFilter = Boolean(user || ground || fromDate || toDate);

  return (
    <div className="rounded-2xl border border-navy/10 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* User */}
        <div className="relative">
          <label className="block text-xs font-semibold uppercase tracking-wide text-navy/60">User</label>
          {user ? (
            <div className="mt-1 flex items-center justify-between rounded-md border border-navy/20 px-3 py-2 text-sm">
              <span className="truncate font-medium text-navy">{user.name}</span>
              <button type="button" onClick={() => setUser(null)} className="ml-2 text-navy/40 hover:text-navy" aria-label="Clear user">✕</button>
            </div>
          ) : (
            <>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onFocus={() => results.length > 0 && setOpen(true)}
                placeholder="Search name or email…"
                className="mt-1 w-full rounded-md border border-navy/20 px-3 py-2 text-sm focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30"
              />
              {open && q.trim().length >= 2 && (
                <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-navy/15 bg-white shadow-lg">
                  {results.length === 0 && <li className="px-3 py-2 text-sm text-navy/50">No matches.</li>}
                  {results.map((u) => (
                    <li key={u.id}>
                      <button type="button" onClick={() => { setUser({ id: u.id, name: u.name }); setQ(""); setResults([]); setOpen(false); }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-navy/5">
                        <span className="font-medium text-navy">{u.name}</span>
                        <span className="block text-xs text-navy/50">{u.email}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {/* Ground */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-navy/60">Ground</label>
          <select value={ground} onChange={(e) => setGround(e.target.value)} className="mt-1 w-full rounded-md border border-navy/20 px-3 py-2 text-sm">
            <option value="">All grounds</option>
            {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>

        {/* From / To */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-navy/60">From</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="mt-1 w-full rounded-md border border-navy/20 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-navy/60">To</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="mt-1 w-full rounded-md border border-navy/20 px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={apply} className="btn-brand rounded-md px-5 py-2 text-sm font-bold uppercase">Apply filters</button>
        {anyFilter && (
          <button type="button" onClick={clear} className="rounded-md border border-navy/20 px-4 py-2 text-sm font-semibold text-navy hover:bg-navy/5">Clear</button>
        )}
        <span className="text-xs text-navy/50">A date range set here overrides the quick All/Upcoming/Past filter.</span>
      </div>
    </div>
  );
}
