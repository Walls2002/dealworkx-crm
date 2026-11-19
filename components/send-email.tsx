"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { FlaskConical, Mail, SendHorizontal } from "lucide-react";
import { sendEmail, sendTestEmail, type FormState } from "@/lib/actions";
import { signatureHtml, type SignatureData } from "@/lib/signature";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Status, toastOnSuccess } from "./lead-forms";
import { RichEditor, textToEditorHtml } from "./rich-editor";

/** Who CRM email goes out as, their signature, or why they can't send. Null when Brevo isn't set up. */
export type MailInfo = { from: { name: string; email: string }; problem: string | null; signature: SignatureData } | null;

function gmailHref(email: string) {
  return `https://mail.google.com/mail/?${new URLSearchParams({ view: "cm", fs: "1", to: email })}`;
}

/**
 * Write and send an email through Brevo, from the user's own address. With a step, sending also marks the step sent.
 * Subject and message start from the step's text and can be edited before sending.
 */
export function EmailComposer({ leadId, to, toName, from, signature, stepId, stepLabel, subject = "", body = "", onClose, className }: {
  leadId: number; to: string; toName: string; from: { name: string; email: string }; signature: SignatureData;
  stepId?: number; stepLabel?: string; subject?: string; body?: string; onClose: () => void; className?: string;
}) {
  const [state, action, sending] = useActionState<FormState, FormData>(toastOnSuccess(sendEmail), null);
  // "Send test to me": same form, same email, delivered to the sender. The composer stays open afterwards.
  const [test, sendTest, testing] = useActionState<FormState, FormData>(sendTestEmail, null);
  const pending = sending || testing;
  const [withSignature, setWithSignature] = useState(true);
  useEffect(() => { if (state?.ok) onClose(); }, [state, onClose]);
  const id = (k: string) => `mail-${leadId}-${stepId ?? "x"}-${k}`;
  const initialHtml = useMemo(() => textToEditorHtml(body), [body]);
  const preview = useMemo(() => signatureHtml(signature, ""), [signature]);
  return (
    <form action={action} className={cn("grid min-w-0 gap-3 rounded-lg border bg-background p-4 [&>*]:min-w-0", className)}>
      <input type="hidden" name="leadId" value={leadId} />
      {stepId && <input type="hidden" name="stepId" value={stepId} />}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
        <span className="font-medium">{stepLabel ? `Send ${stepLabel}` : "New email"}</span>
        <span className="text-xs text-muted-foreground">Sent through Brevo{stepLabel ? ", then marked sent" : ""}</span>
      </div>
      <dl className="grid gap-1 text-[13px]">
        <div className="flex min-w-0 gap-2"><dt className="w-14 shrink-0 text-muted-foreground">From</dt><dd className="min-w-0 truncate">{from.name} &lt;{from.email}&gt;</dd></div>
        <div className="flex min-w-0 gap-2"><dt className="w-14 shrink-0 text-muted-foreground">To</dt><dd className="min-w-0 truncate">{toName ? `${toName} <${to}>` : to}</dd></div>
      </dl>
      <div className="grid gap-1.5">
        <Label htmlFor={id("subject")}>Subject</Label>
        <Input id={id("subject")} name="subject" required maxLength={300} defaultValue={subject} />
      </div>
      <div className="grid gap-1.5">
        <Label id={id("body-label")}>Message</Label>
        <RichEditor initialHtml={initialHtml} htmlName="html" textName="body" labelId={id("body-label")} disabled={pending} />
      </div>
      <input type="hidden" name="signature" value={withSignature ? "1" : "0"} />
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={withSignature} onCheckedChange={(v) => setWithSignature(v === true)} /> Add my signature
          </label>
          <Link href="/signature" className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Edit signature</Link>
        </div>
        {withSignature && (
          <div className="overflow-x-auto rounded-lg border bg-white px-4 py-3" aria-label="Signature preview" dangerouslySetInnerHTML={{ __html: preview }} />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={pending}><SendHorizontal /> {sending ? "Sending…" : "Send email"}</Button>
        <Button size="sm" variant="outline" formAction={sendTest} disabled={pending} title={`Send this exact email to ${from.email} first`}>
          <FlaskConical /> {testing ? "Sending test…" : "Send test to me"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={pending}>Cancel</Button>
      </div>
      {state?.error && <Status state={state} />}
      {!state?.error && test && <Status state={test} />}
    </form>
  );
}

/** "Send from CRM" for a step: a button that opens the composer, or the reason it's unavailable. */
export function StepEmailButton({ mail, open, onOpen }: { mail: MailInfo; open: boolean; onOpen: () => void }) {
  if (!mail) return null;
  return (
    <Button size="sm" disabled={!!mail.problem || open} title={mail.problem ?? `Send from ${mail.from.email}`} onClick={onOpen} type="button">
      <SendHorizontal /> Send from CRM
    </Button>
  );
}

/** The lead header's email buttons: Gmail as before, plus a one-off email from the CRM. */
export function LeadEmailActions({ leadId, email, toName, mail, canWrite }: { leadId: number; email: string; toName: string; mail: MailInfo; canWrite: boolean }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <Button variant="outline" className="h-auto min-h-8" asChild>
        <a href={gmailHref(email)} target="_blank" rel="noopener noreferrer"><Mail /> Gmail</a>
      </Button>
      {mail && canWrite && (
        <Button variant="outline" className="h-auto min-h-8" disabled={!!mail.problem || open} title={mail.problem ?? `Send from ${mail.from.email}`} onClick={() => setOpen(true)}>
          <SendHorizontal /> Email from CRM
        </Button>
      )}
      {open && mail && !mail.problem && (
        <EmailComposer className="basis-full" leadId={leadId} to={email} toName={toName} from={mail.from} signature={mail.signature} onClose={close} />
      )}
    </>
  );
}
