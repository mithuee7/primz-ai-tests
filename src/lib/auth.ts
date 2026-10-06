import "server-only";
import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/env";
import { createAuthClient } from "@/lib/supabase/clients";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  demo: boolean;
}

const DEMO_USER: SessionUser = { id: "demo-user", email: "demo@primz.local", name: "Demo operator", demo: true };

/** Returns the signed-in user or null. In demo mode there is always a demo user. */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (isDemoMode()) return DEMO_USER;
  const supabase = await createAuthClient();
  const { data, error } = await supabase.auth.getUser(); // validates the JWT with Supabase
  if (error || !data.user) return null;
  const email = data.user.email ?? "";
  return { id: data.user.id, email, name: email.split("@")[0] ?? "Operator", demo: false };
}

/** For pages/layouts: redirects to /login if unauthenticated. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** For server actions / route handlers: throws instead of redirecting. */
export async function requireUserForAction(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}
