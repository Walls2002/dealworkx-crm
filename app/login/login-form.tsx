"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";
import { login, type FormState } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AUTH } from "@/components/auth-styles";
import { AuthMessage } from "@/components/auth-message";
import { PasswordInput } from "@/components/password-input";

export function LoginForm({ demoUsers, demoPassword }: { demoUsers: { email: string; name: string; role: string }[]; demoPassword: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(login, null);
  const email = useRef<HTMLInputElement>(null);
  const password = useRef<HTMLInputElement>(null);

  return (
    <form action={action} className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="email" className={AUTH.label}>Work email</Label>
        <Input ref={email} id="email" type="email" name="email" autoComplete="username" placeholder="you@dealworkx.com" required autoFocus className={AUTH.input} aria-invalid={state?.error ? true : undefined} />
      </div>
      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="password" className={AUTH.label}>Password</Label>
          <Link href="/forgot-password" className={`text-sm ${AUTH.link}`}>Forgot password?</Link>
        </div>
        <PasswordInput ref={password} id="password" name="password" autoComplete="current-password" required inputClassName={AUTH.input} toggleClassName={AUTH.toggle} aria-invalid={state?.error ? true : undefined} />
      </div>
      {state?.error && <AuthMessage error={state.error} />}
      <Button className={AUTH.button} disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button>
      <p className="text-center text-sm text-[#4b5563]">New to the team? Ask an admin to send you an invite.</p>

      {demoPassword && demoUsers.length > 0 && (
        <div className="grid gap-2 border-t border-[#e5e7eb] pt-5">
          <p className="text-xs text-[#4b5563]">
            Demo accounts, password <code className="rounded bg-[#f3f4f6] px-1 py-0.5 font-mono">{demoPassword}</code>. Pick one to fill the form.
          </p>
          <ul className="grid gap-1">
            {demoUsers.map((u) => (
              <li key={u.email}>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto w-full justify-between px-2 py-1.5 font-normal"
                  onClick={() => {
                    if (email.current) email.current.value = u.email;
                    if (password.current) password.current.value = demoPassword;
                    password.current?.focus();
                  }}
                >
                  <span className="font-medium">{u.name}</span>
                  <span className="truncate text-xs text-[#4b5563]">{u.role === "admin" ? "Admin" : "Member"} · {u.email}</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
