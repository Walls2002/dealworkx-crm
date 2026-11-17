"use client";

import { useActionState, useRef } from "react";
import { login, type FormState } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Status } from "@/components/lead-forms";

export function LoginForm({ demoUsers, demoPassword }: { demoUsers: { email: string; name: string; role: string }[]; demoPassword: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(login, null);
  const email = useRef<HTMLInputElement>(null);
  const password = useRef<HTMLInputElement>(null);

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="email">Work email</Label>
        <Input ref={email} id="email" type="email" name="email" autoComplete="username" placeholder="you@dealworkx.com" required autoFocus />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input ref={password} id="password" type="password" name="password" autoComplete="current-password" required />
      </div>
      <Button size="lg" className="w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button>
      {state?.error && <Status state={state} />}

      {demoPassword && demoUsers.length > 0 && (
        <div className="grid gap-2 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            Demo accounts, password <code className="rounded bg-muted px-1 py-0.5 font-mono">{demoPassword}</code>. Pick one to fill the form.
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
                  <span className="truncate text-xs text-muted-foreground">{u.role === "admin" ? "Admin" : "Rep"} · {u.email}</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
