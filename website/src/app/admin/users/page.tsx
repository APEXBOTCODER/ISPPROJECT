import Link from "next/link";
import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import UserSearch from "@/components/UserSearch";

export const metadata = { title: "Admin · Users" };
export const dynamic = "force-dynamic";

const roleStyles: Record<string, string> = {
  ADMIN: "bg-sky/10 text-sky-deep",
  STAFF: "bg-pitch/10 text-pitch-deep",
  CUSTOMER: "bg-navy/5 text-navy/60",
};

export default async function AdminUsersPage() {
  await requireStaff();
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

      <div className="mt-4 max-w-md">
        <UserSearch redirectBase="/admin/users/" placeholder="Search users by name or email…" />
      </div>

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
