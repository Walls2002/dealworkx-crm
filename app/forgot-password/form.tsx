"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowLeft } from "lucide-react";
import { requestPasswordReset, type FormState } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AUTH } from "@/components/auth-styles";
import { AuthMessage } from "@/components/auth-message";

export function ForgotForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(requestPasswordReset, null);
  return (
    <form action={action} className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="email" className={AUTH.label}>Work email</Label>
        <Input id="email" type="email" name="email" autoComplete="username" placeholder="you@dealworkx.com" required autoFocus className={AUTH.input} />
      </div>
      <AuthMessage error={state?.error} ok={state?.ok} />
      <Button className={AUTH.button} disabled={pending}>{pending ? "Sending…" : state?.ok ? "Send another link" : "Send reset link"}</Button>
      <Link href="/login" className={`inline-flex items-center justify-center gap-1.5 text-sm ${AUTH.link}`}>
        <ArrowLeft className="size-4" aria-hidden /> Back to sign in
      </Link>
    </form>
  );
}
