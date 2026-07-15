"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface FoundUser {
  id: string;
  name: string;
  email: string;
  role: string;
  emailVerified: string | null;
}

/**
 * Debounced typeahead over /api/admin/users/search. Either navigates on select
 * (redirectTo) or hands the user back to a parent (onSelect) — used by the
 * refund flows, users list, and admin booking. Scales to 1000+ users.
 */
export default function UserSearch({
  onSelect,
  redirectBase,
  placeholder = "Search by name or email…",
  initialLabel,
}: {
  onSelect?: (u: FoundUser) => void;
  /** If set, selecting a user navigates to `${redirectBase}${user.id}`. */
  redirectBase?: string;
  placeholder?: string;
  initialLabel?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialLabel ?? "");
  const [results, setResults] = useState<FoundUser[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(query)}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!cancelled) {
          setResults(data.users ?? []);
          setOpen(true);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  // Avoid firing a search for the label we just set on selection.
  const justPicked = useRef(false);

  function pick(u: FoundUser) {
    justPicked.current = true;
    setOpen(false);
    setResults([]);
    setQ(`${u.name} · ${u.email}`);
    if (redirectBase) router.push(`${redirectBase}${u.id}`);
    onSelect?.(u);
  }

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => {
          justPicked.current = false;
          setQ(e.target.value);
        }}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-md border border-navy/20 px-3 py-2 text-sm focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30"
      />
      {open && q.trim().length >= 2 && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-navy/15 bg-white shadow-lg">
          {loading && <li className="px-3 py-2 text-sm text-navy/50">Searching…</li>}
          {!loading && results.length === 0 && (
            <li className="px-3 py-2 text-sm text-navy/50">No matches.</li>
          )}
          {results.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => pick(u)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-navy/5"
              >
                <span className="font-medium text-navy">{u.name}</span>
                <span className="block text-xs text-navy/50">
                  {u.email} · {u.role}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
