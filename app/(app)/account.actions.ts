"use server";

// Account-level server actions (sign out). Kept tiny and separate so the
// client Sidebar can import just this without pulling in the full auth module.

import { signOut } from "@/auth";

export async function logout() {
  await signOut({ redirectTo: "/login" });
}
