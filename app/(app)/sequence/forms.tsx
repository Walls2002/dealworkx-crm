"use client";

import { useActionState } from "react";
import { saveCallOutcomes, saveDailyLimits, savePainPoints, saveStep, type FormState } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChannelIcon } from "@/components/icons";
import { Status } from "@/components/lead-forms";

type Step = { id: number; stepNumber: number; channel: string; dayOffset: number; subject: string; body: string; subjectTitled: string; bodyTitled: string };

export function StepEditor({ step }: { step: Step }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveStep, null);
  const id = `step-${step.id}`;
  return (
    <Card>
      <CardHeader>
        <CardTitle id={`${id}-h`} className="flex items-center gap-2"><ChannelIcon channel={step.channel} className="size-4" /> Step {step.stepNumber} · {step.channel}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} aria-labelledby={`${id}-h`} className="grid gap-4">
          <input type="hidden" name="stepId" value={step.id} />
          <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
            <div className="grid gap-2">
              <Label htmlFor={`${id}-day`}>Send on day</Label>
              <Input id={`${id}-day`} type="number" name="dayOffset" min={0} max={90} defaultValue={step.dayOffset} required />
            </div>
            {step.channel === "Email" ? (
              <div className="grid gap-2">
                <Label htmlFor={`${id}-subject`}>Subject</Label>
                <Input id={`${id}-subject`} name="subject" defaultValue={step.subject} maxLength={300} />
              </div>
            ) : (
              <input type="hidden" name="subject" value="" />
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-body`}>General message</Label>
            <Textarea id={`${id}-body`} name="body" defaultValue={step.body} rows={step.channel === "Email" ? 9 : 3} required className="max-h-[70vh] field-sizing-content" />
          </div>
          <div className="grid gap-3 rounded-lg border border-dashed p-3">
            <p className="text-xs text-muted-foreground">Job-title aligned version, shown when the rep picks that messaging mode. Leave blank to use the general message.</p>
            {step.channel === "Email" ? (
              <div className="grid gap-2">
                <Label htmlFor={`${id}-subject-t`}>Job-title subject</Label>
                <Input id={`${id}-subject-t`} name="subjectTitled" defaultValue={step.subjectTitled} maxLength={300} />
              </div>
            ) : (
              <input type="hidden" name="subjectTitled" value="" />
            )}
            <div className="grid gap-2">
              <Label htmlFor={`${id}-body-t`}>Job-title message</Label>
              <Textarea id={`${id}-body-t`} name="bodyTitled" defaultValue={step.bodyTitled} rows={step.channel === "Email" ? 6 : 3} className="max-h-[70vh] field-sizing-content" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" disabled={pending}>{pending ? "Saving…" : "Save step"}</Button>
            <Status state={state} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function PainPointsForm({ painPoints }: { painPoints: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(savePainPoints, null);
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="pain-points">One per line</Label>
        <Textarea id="pain-points" name="painPoints" rows={6} defaultValue={painPoints.join("\n")} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" disabled={pending}>{pending ? "Saving…" : "Save pain points"}</Button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function DailyLimitsForm({ email, linkedin }: { email: number | null; linkedin: number | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveDailyLimits, null);
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="lim-email">Email, new leads per owner per day</Label>
          <Input id="lim-email" type="number" name="daily_email_limit" min={0} max={10000} defaultValue={email ?? ""} placeholder="No limit" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="lim-li">LinkedIn, new leads per owner per day</Label>
          <Input id="lim-li" type="number" name="daily_linkedin_limit" min={0} max={10000} defaultValue={linkedin ?? ""} placeholder="No limit" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" disabled={pending}>{pending ? "Saving…" : "Save limits"}</Button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function CallOutcomesForm({ outcomes }: { outcomes: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveCallOutcomes, null);
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="outcomes">One per line, in the order reps see them</Label>
        <Textarea id="outcomes" name="outcomes" rows={10} defaultValue={outcomes.join("\n")} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" disabled={pending}>{pending ? "Saving…" : "Save call outcomes"}</Button>
        <Status state={state} />
      </div>
    </form>
  );
}
