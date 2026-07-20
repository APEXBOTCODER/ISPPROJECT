"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { FoundUser } from "@/components/UserSearch";

/**
 * Searchable multi-select of users for the "revenue by user" report. Selecting
 * users and clicking Apply reloads Reports with ?users=id1,id2 (keeping the date
 * range), and the server computes each user's revenue for that range.
 */
export default function UserRevenueSelect({
  from,
  to,
  initial,
}: {
  from: string;
  to: string;
  initial: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<{ id: string; name: string }[]>(initial);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoundUser[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(query)}`, { cache: "no-store" });
        const data = await res.json();
        if (!cancelled) {
          setResults(data.users ?? []);
          setOpen(true);
        }
      } catch {
        if (!cancelled) setResults([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const add = (u: FoundUser) => {
    if (!selected.some((s) => s.id === u.id)) setSelected([...selected, { id: u.id, name: u.name }]);
    setQ("");
    setResults([]);
    setOpen(false);
  };
  const remove = (id: string) => setSelected(selected.filter((s) => s.id !== id));

  const apply = () => {
    const p = new URLSearchParams({ from, to });
    if (selected.length) p.set("users", selected.map((s) => s.id).join(","));
    router.push(`/admin/reports?${p.toString()}`);
  };

  return (
    <div>
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1 rounded-full bg-navy/5 px-3 py-1 text-xs font-semibold text-navy">
              {s.name}
              <button type="button" onClick={() => remove(s.id)} className="text-navy/40 hover:text-navy" aria-label={`Remove ${s.name}`}>
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-start gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="Search users by name or email…"
            className="w-full rounded-md border border-navy/20 px-3 py-2 text-sm focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30"
          />
          {open && q.trim().length >= 2 && (
            <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-navy/15 bg-white shadow-lg">
              {results.length === 0 && <li className="px-3 py-2 text-sm text-navy/50">No matches.</li>}
              {results.map((u) => (
                <li key={u.id}>
                  <button type="button" onClick={() => add(u)} className="block w-full px-3 py-2 text-left text-sm hover:bg-navy/5">
                    <span className="font-medium text-navy">{u.name}</span>
                    <span className="block text-xs text-navy/50">{u.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={apply}
          className="rounded-md border border-navy/20 px-4 py-2 text-sm font-semibold text-navy hover:bg-navy/5"
        >
          Apply
        </button>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setSelected([]);
              router.push(`/admin/reports?from=${from}&to=${to}`);
            }}
            className="rounded-md px-3 py-2 text-sm text-navy/50 hover:text-navy"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
