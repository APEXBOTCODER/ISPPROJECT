import Link from "next/link";
import { auth } from "@/lib/auth";
import InfinityMark from "@/components/InfinityMark";

const navLinks = [
  { href: "/facilities", label: "Facilities" },
  { href: "/cricket", label: "Cricket" },
  { href: "/soccer", label: "Soccer" },
  { href: "/tournaments", label: "Tournaments" },
  { href: "/training", label: "Training" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
];

export default async function Header() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="sticky top-0 z-50 bg-navy/95 text-white backdrop-blur supports-[backdrop-filter]:bg-navy/85">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <InfinityMark className="h-8 w-auto" />
          <span className="display text-xl leading-none">
            Infinity <span className="gradient-text">Sports Park</span>
          </span>
        </Link>

        <nav className="hidden lg:flex items-center gap-6 text-sm font-medium">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-pitch transition-colors">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-3">
          {user ? (
            <>
              {(user.role === "ADMIN" || user.role === "STAFF") && (
                <Link href="/admin" className="text-sm font-medium hover:text-pitch">
                  Admin
                </Link>
              )}
              <Link href="/dashboard" className="text-sm font-medium hover:text-pitch">
                My Account
              </Link>
            </>
          ) : (
            <Link href="/login" className="text-sm font-medium hover:text-pitch">
              Log in
            </Link>
          )}
          <Link
            href="/book"
            className="btn-brand rounded-full px-5 py-2 text-sm uppercase tracking-wide"
          >
            Book a Field
          </Link>
        </div>

        {/* Mobile menu — CSS-only so the header stays a server component */}
        <details className="lg:hidden relative">
          <summary className="list-none cursor-pointer rounded-md border border-white/20 px-3 py-2 text-sm font-semibold">
            Menu
          </summary>
          <div className="absolute right-0 mt-2 w-56 rounded-xl bg-navy-deep p-3 shadow-2xl ring-1 ring-white/10 flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} className="rounded-md px-3 py-2 text-sm hover:bg-white/10">
                {link.label}
              </Link>
            ))}
            <hr className="my-1 border-white/10" />
            {user ? (
              <>
                <Link href="/dashboard" className="rounded-md px-3 py-2 text-sm hover:bg-white/10">
                  My Account
                </Link>
                {(user.role === "ADMIN" || user.role === "STAFF") && (
                  <Link href="/admin" className="rounded-md px-3 py-2 text-sm hover:bg-white/10">
                    Admin
                  </Link>
                )}
              </>
            ) : (
              <Link href="/login" className="rounded-md px-3 py-2 text-sm hover:bg-white/10">
                Log in
              </Link>
            )}
            <Link href="/book" className="btn-brand mt-1 rounded-md px-3 py-2 text-center text-sm font-bold uppercase">
              Book a Field
            </Link>
          </div>
        </details>
      </div>
    </header>
  );
}
