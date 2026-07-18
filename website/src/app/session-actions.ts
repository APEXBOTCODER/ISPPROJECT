"use server";

import { signOut } from "@/lib/auth";

/** Sign the user out after client-detected inactivity and send them to login. */
export async function idleLogoutAction() {
  await signOut({ redirectTo: "/login?timeout=1" });
}
