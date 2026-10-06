"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { isDemoMode } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { createAuthClient } from "@/lib/supabase/clients";

const credentials = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export interface LoginState {
  error?: string;
  notice?: string;
}

export async function signInAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (isDemoMode()) redirect("/dashboard");
  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  if (!rateLimit(`login:${parsed.data.email.toLowerCase()}`, 8, 10 * 60_000).ok) {
    return { error: "Too many attempts. Wait a few minutes and try again." };
  }

  const supabase = await createAuthClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Incorrect email or password." }; // same message for every failure
  redirect("/dashboard");
}

export async function signUpAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (isDemoMode()) redirect("/dashboard");
  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  if (!rateLimit(`signup:${parsed.data.email.toLowerCase()}`, 4, 60 * 60_000).ok) {
    return { error: "Too many attempts. Try again later." };
  }

  const supabase = await createAuthClient();
  const { data, error } = await supabase.auth.signUp(parsed.data);
  if (error) return { error: error.message };
  if (!data.session) return { notice: "Check your email to confirm your account, then sign in." };
  redirect("/dashboard");
}
