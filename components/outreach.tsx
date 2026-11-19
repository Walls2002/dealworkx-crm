"use client";

import { useState } from "react";
import { ExternalLink, Send } from "lucide-react";
import { inlineDue, relativeDue, shortDate } from "@/lib/dates";
import { MESSAGING_MODES } from "@/lib/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ChannelIcon } from "./icons";
import { CopyButton, StepButton } from "./lead-forms";
import { EmailComposer, StepEmailButton, type MailInfo } from "./send-email";

type Step = {
  id: number; stepNumber: number; channel: string; dueOn: string | null;
  subject: string; body: string; subjectTitled: string; bodyTitled: string; hasTitled: boolean;
};

function gmailHref(email: string, subject = "", body = "") {
  return `https://mail.google.com/mail/?${new URLSearchParams({ view: "cm", fs: "1", to: email, su: subject, body })}`;
}

/**
 * The current step's message, as the old Console showed it: a Messaging mode (job-title aligned or general)
 * and a preview "as of" date. A step due after the preview date reads "Scheduled for later".
 */
export function CurrentStep({ step, today, leadId, canWrite, email, toName, linkedin, mail }: { step: Step; today: string; leadId: number; canWrite: boolean; email: string; toName: string; linkedin: string | null; mail: MailInfo }) {
  const [mode, setMode] = useState<(typeof MESSAGING_MODES)[number]>("Job-title aligned");
  const [asOf, setAsOf] = useState(today);
  const [composing, setComposing] = useState(false);
  const canSend = canWrite && step.channel === "Email" && !!email && !!mail;
  const titled = mode === "Job-title aligned";
  const subject = titled ? step.subjectTitled : step.subject;
  const body = titled ? step.bodyTitled : step.body;
  const later = !!step.dueOn && step.dueOn > (asOf || today);
  const due = step.dueOn ? relativeDue(step.dueOn, asOf || today) : null;

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`mode-${leadId}`} className="text-xs text-muted-foreground">Messaging mode</Label>
          <NativeSelect id={`mode-${leadId}`} size="sm" className="w-full" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            {MESSAGING_MODES.map((m) => <NativeSelectOption key={m}>{m}</NativeSelectOption>)}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`asof-${leadId}`} className="text-xs text-muted-foreground">Preview as of</Label>
          <Input id={`asof-${leadId}`} type="date" className="h-7 text-[13px]" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/50 px-4 py-2.5">
          <span className="inline-flex items-center gap-2 text-sm font-medium"><ChannelIcon channel={step.channel} className="size-4" /> Step {step.stepNumber} · {step.channel}</span>
          <span className="flex items-center gap-2">
            {later ? (
              <Badge variant="secondary">Scheduled for later</Badge>
            ) : due && (
              <Badge variant={due.tone === "overdue" ? "destructive" : "outline"} className={due.tone === "today" ? "border-amber-300 bg-amber-50 text-amber-800" : undefined}>
                {due.tone === "today" ? "Due today" : due.tone === "overdue" ? due.label : `Due ${inlineDue(due.label)}`}
              </Badge>
            )}
            {canWrite && <StepButton leadId={leadId} stepId={step.id} label="Mark sent" />}
          </span>
        </div>
        {titled && !step.hasTitled && (
          <p className="border-b bg-amber-50/60 px-4 py-2 text-xs text-amber-800">No job-title version written for this step yet; showing the general message. Add one on the Sequence page.</p>
        )}
        {later && <p className="border-b px-4 py-2 text-xs text-muted-foreground">Not due as of {shortDate(asOf)}; it falls due on {shortDate(step.dueOn!)}.</p>}
        {step.channel === "Email" && subject && (
          <p className="px-4 pt-3 text-sm"><span className="text-muted-foreground">Subject </span><span className="font-medium">{subject}</span></p>
        )}
        <pre className="max-h-64 overflow-auto px-4 py-3 font-sans text-sm leading-relaxed whitespace-pre-wrap">{body || "This step's message is empty. Write it on the Sequence page."}</pre>
        <div className="flex flex-wrap gap-2 border-t bg-muted/30 px-4 py-2.5">
          {canSend && <StepEmailButton mail={mail} open={composing} onOpen={() => setComposing(true)} />}
          {step.channel === "Email" && subject && <CopyButton text={subject} label="Copy subject" />}
          {body && <CopyButton text={body} label="Copy message" />}
          {step.channel === "Email" && email && (
            <Button variant="outline" size="sm" asChild>
              <a href={gmailHref(email, subject, body)} target="_blank" rel="noopener noreferrer"><Send /> Open in Gmail</a>
            </Button>
          )}
          {step.channel === "LinkedIn" && linkedin && (
            <Button variant="outline" size="sm" asChild>
              <a href={linkedin} target="_blank" rel="noopener noreferrer"><ExternalLink /> Open LinkedIn</a>
            </Button>
          )}
          {canSend && mail.problem && <p className="basis-full text-xs text-muted-foreground">{mail.problem}</p>}
        </div>
        {canSend && composing && !mail.problem && (
          <EmailComposer
            key={mode}
            className="rounded-none border-0 border-t"
            leadId={leadId}
            to={email}
            toName={toName}
            from={mail.from}
            signature={mail.signature}
            stepId={step.id}
            stepLabel={`Step ${step.stepNumber} · Email`}
            subject={subject}
            body={body}
            onClose={() => setComposing(false)}
          />
        )}
      </div>
    </div>
  );
}
