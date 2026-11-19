"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePassword, type FormState } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Status } from "@/components/lead-forms";
import { PasswordInput } from "@/components/password-input";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePassword, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) form.current?.reset(); }, [state]);
  return (
    <form ref={form} action={action} className="grid gap-4 rounded-xl border bg-card p-5" aria-labelledby="pw-heading">
      <div>
        <h3 id="pw-heading" className="text-sm font-semibold">Change password</h3>
        <p className="text-xs text-muted-foreground">At least 8 characters. Other devices are signed out when you change it.</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="pw-current">Current password</Label>
        <PasswordInput id="pw-current" name="current" autoComplete="current-password" required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="pw-new">New password</Label>
          <PasswordInput id="pw-new" name="password" autoComplete="new-password" minLength={8} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pw-confirm">Repeat new password</Label>
          <PasswordInput id="pw-confirm" name="confirm" autoComplete="new-password" minLength={8} required />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending}>{pending ? "Saving…" : "Change password"}</Button>
        <Status state={state} />
      </div>
    </form>
  );
}
