import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/env";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  if (isDemoMode()) redirect("/dashboard");
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl sm:p-8">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 font-bold text-white">P</span>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Primz AI</h1>
            <p className="text-xs text-zinc-500">Sign in to your dashboard</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
