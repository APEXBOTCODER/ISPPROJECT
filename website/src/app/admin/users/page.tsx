import Link from "next/link";
import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import UserSearch from "@/components/UserSearch";
import { createUser } from "./actions";

export const metadata = { title: "Admin · Users" };
export const dynamic = "force-dynamic";

const roleStyles: Record<string, string> = {
  ADMIN: "bg-sky/10 text-sky-deep",
  STAFF: "bg-pitch/10 text-pitch-deep",
  CUSTOMER: "bg-navy/5 text-navy/60",
};

const inputCls =
  "mt-1 block w-full rounded-md border border-navy/20 px-3 py-2 text-sm focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30";
const labelCls = "text-xs font-semibold uppercase tracking-wide text-navy/60";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const staff = await requireStaff();
  const isAdmin = staff.role === "ADMIN";
  const { ok, error } = await searchParams;
  const [total, recent] = await Promise.all([
    prisma.user.count(),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        emailVerified: true,
        createdAt: true,
        _count: { select: { bookings: true } },
      },
    }),
  ]);

  return (
    <div>
      <h1 className="display text-4xl text-navy">Users</h1>
      <p className="mt-2 text-sm text-navy/60">{total} registered. Search to find anyone.</p>

      {ok && (
        <p className="mt-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800 ring-1 ring-green-200">{ok}</p>
      )}
      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>
      )}

      <div className="mt-4 max-w-md">
        <UserSearch redirectBase="/admin/users/" placeholder="Search users by name or email…" />
      </div>

      {isAdmin && (
        <details className="mt-4 rounded-2xl border border-navy/10 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-navy">+ Create a user</summary>
          <form action={createUser} className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className={labelCls}>
              Name
              <input name="name" required placeholder="Argyle Cricket Club" className={inputCls} />
            </label>
            <label className={labelCls}>
              Email
              <input name="email" type="email" required placeholder="name@example.com" className={inputCls} />
            </label>
            <label className={labelCls}>
              Role
              <select name="role" defaultValue="CUSTOMER" className={inputCls}>
                <option value="CUSTOMER">Customer</option>
                <option value="STAFF">Staff</option>
                <option value="ADMIN">Admin</option>
              </select>
            </label>
            <label className={labelCls}>
              Temporary password (optional)
              <input name="password" type="text" autoComplete="off" placeholder="leave blank = no login" className={inputCls} />
            </label>
            <div className="sm:col-span-2">
              <button className="btn-brand rounded-md px-5 py-2 text-sm font-bold uppercase">Create user</button>
            </div>
          </form>
          <p className="mt-2 text-xs text-navy/50">
            To register an organization for bulk bookings, create it as a user with the org name and any
            email, and leave the password blank (it won&apos;t log in).
          </p>
        </details>
      )}

      <h2 className="mt-8 display text-2xl text-navy">Recent signups</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-navy/15 text-xs uppercase text-navy/50">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Role</th>
              <th className="py-2 pr-4">Verified</th>
              <th className="py-2 pr-4">Bookings</th>
              <th className="py-2">Joined</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((u) => (
              <tr key={u.id} className="border-b border-navy/5 hover:bg-navy/[0.02]">
                <td className="py-2.5 pr-4 font-medium">
                  <Link href={`/admin/users/${u.id}`} className="text-sky hover:underline">
                    {u.name}
                  </Link>
                  {!u.active && (
                    <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600 ring-1 ring-red-200">
                      Deactivated
                    </span>
                  )}
                </td>
                <td className="py-2.5 pr-4 text-navy/70">{u.email}</td>
                <td className="py-2.5 pr-4">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${roleStyles[u.role] ?? roleStyles.CUSTOMER}`}>
                    {u.role}
                  </span>
                </td>
                <td className="py-2.5 pr-4">{u.emailVerified ? "✓" : "—"}</td>
                <td className="py-2.5 pr-4">{u._count.bookings}</td>
                <td className="py-2.5 text-navy/60">{u.createdAt.toISOString().slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
