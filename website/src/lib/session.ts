import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/** Server-side guard: returns the session user or redirects to /login. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user;
}

/** Server-side guard for the admin area: STAFF or ADMIN roles only. */
export async function requireStaff() {
  const user = await requireUser();
  if (user.role !== "STAFF" && user.role !== "ADMIN") redirect("/");
  return user;
}

/** Server-side guard for sensitive admin actions: ADMIN role only. */
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/admin");
  return user;
}
