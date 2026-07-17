"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLink = { href: string; label: string };

/**
 * Mobile nav menu. Unlike a CSS-only <details>, this closes itself when the
 * route changes (after a link is tapped), on an explicit close, and on
 * click-away — so it doesn't stay open over the page you just navigated to.
 */
export default function MobileMenu({
  navLinks,
  user,
}: {
  navLinks: NavLink[];
  user: { role?: string | null } | null;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close whenever the route changes (i.e. after a link is tapped).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isStaff = user?.role === "ADMIN" || user?.role === "STAFF";
  const linkCls = "rounded-md px-3 py-2 text-sm hover:bg-white/10";
  const close = () => setOpen(false);

  return (
    <div className="lg:hidden relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Toggle menu"
        className="rounded-md border border-white/20 px-3 py-2 text-sm font-semibold"
      >
        Menu
      </button>

      {open && (
        <>
          {/* click-away backdrop */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl bg-navy-deep p-3 shadow-2xl ring-1 ring-white/10 flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} onClick={close} className={linkCls}>
                {link.label}
              </Link>
            ))}
            <hr className="my-1 border-white/10" />
            {user ? (
              <>
                <Link href="/dashboard" onClick={close} className={linkCls}>
                  My Account
                </Link>
                {isStaff && (
                  <Link href="/admin" onClick={close} className={linkCls}>
                    Admin
                  </Link>
                )}
              </>
            ) : (
              <Link href="/login" onClick={close} className={linkCls}>
                Log in
              </Link>
            )}
            <Link
              href="/book"
              onClick={close}
              className="btn-brand mt-1 rounded-md px-3 py-2 text-center text-sm font-bold uppercase"
            >
              Book a Field
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
