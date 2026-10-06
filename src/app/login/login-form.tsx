"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/primitives";
import { signInAction, signUpAction, type LoginState } from "./actions";

export function LoginForm() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [state, action, pending] = useActionState<LoginState, FormData>(mode === "in" ? signInAction : signUpAction, {});

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="field" />
      </div>
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} required minLength={8} className="field" />
      </div>
      {state.error ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p> : null}
      {state.notice ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.notice}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {mode === "in" ? "Sign in" : "Create account"}
      </Button>
      <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")} className="w-full text-center text-sm text-zinc-500 hover:text-zinc-900">
        {mode === "in" ? "Need an account? Create one" : "Have an account? Sign in"}
      </button>
    </form>
  );
}
