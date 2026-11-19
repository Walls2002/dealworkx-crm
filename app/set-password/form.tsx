"use client";

import { useActionState, useState } from "react";
import { Check } from "lucide-react";
import { setPasswordFromLink, type FormState } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AUTH } from "@/components/auth-styles";
import { AuthMessage } from "@/components/auth-message";
import { PasswordInput } from "@/components/password-input";

export function SetPasswordForm({ token, invite }: { token: string; invite: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(setPasswordFromLink, null);
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const checks = [
    { ok: pw.length >= 8, label: "At least 8 characters" },
    { ok: pw.length > 0 && pw === again, label: "Both passwords match" },
  ];
  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="token" value={token} />
      <div className="grid gap-2">
        <Label htmlFor="password" className={AUTH.label}>New password</Label>
        <PasswordInput id="password" name="password" autoComplete="new-password" minLength={8} required autoFocus value={pw} onChange={(e) => setPw(e.target.value)} inputClassName={AUTH.input} toggleClassName={AUTH.toggle} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirm" className={AUTH.label}>Repeat password</Label>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" minLength={8} required value={again} onChange={(e) => setAgain(e.target.value)} inputClassName={AUTH.input} toggleClassName={AUTH.toggle} />
      </div>
      <ul className="grid gap-1.5 text-sm" aria-label="Password requirements">
        {checks.map((c) => (
          <li key={c.label} className={cn("flex items-center gap-2", c.ok ? "text-[#166534]" : "text-[#4b5563]")}>
            <span className={cn("grid size-4 place-items-center rounded-full border", c.ok ? "border-[#16A34A] bg-[#16A34A] text-white" : "border-[#9ca3af]")} aria-hidden>
              {c.ok && <Check className="size-3" strokeWidth={3} />}
            </span>
            {c.label}<span className="sr-only">{c.ok ? " (done)" : " (not yet)"}</span>
          </li>
        ))}
      </ul>
      {state?.error && <AuthMessage error={state.error} />}
      <Button className={AUTH.button} disabled={pending}>{pending ? "Saving…" : invite ? "Set password and sign in" : "Save and sign in"}</Button>
    </form>
  );
}
