"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items: { href: string; label: string; exact?: boolean }[] = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/refunds", label: "Refunds" },
  { href: "/admin/maintenance", label: "Maintenance" },
  { href: "/admin/resources", label: "Facilities" },
  { href: "/admin/tournaments", label: "Tournaments" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/media", label: "Images" },
  { href: "/admin/content", label: "Site content" },
  { href: "/admin/waiver", label: "Waiver" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/settings", label: "Settings" },
];

export default function AdminNav() {
  const pathname = usePathname();
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
      {items.map((it) => {
        const active = isActive(it.href, it.exact);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
              active ? "bg-navy text-white" : "text-navy/70 hover:bg-navy/5"
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
