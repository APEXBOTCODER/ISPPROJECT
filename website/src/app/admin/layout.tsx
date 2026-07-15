import { requireStaff } from "@/lib/session";
import AdminNav from "@/components/AdminNav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireStaff();
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="lg:grid lg:grid-cols-[190px_1fr] lg:gap-8">
        <aside className="mb-4 lg:sticky lg:top-20 lg:mb-0 lg:h-fit">
          <div className="mb-2 hidden text-xs font-bold uppercase tracking-wide text-navy/40 lg:block">
            Admin
          </div>
          <AdminNav />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
