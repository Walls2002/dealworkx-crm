"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, CircleAlert, Copy, Undo2 } from "lucide-react";
import { addNote, assignLeads, logCall, markStepSent, updateLeadSettings, type FormState } from "@/lib/actions";
import { CHANNEL_PLANS, DISPOSITIONS, LEAD_STATUSES } from "@/lib/schema";
import type { Capacity } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { CapacityNote } from "./capacity-note";
import { toast } from "./toast";

export function Status({ state }: { state: FormState }) {
  if (!state) return <span role="status" />;
  return state.error ? (
    <p className="flex items-start gap-1.5 text-sm text-destructive" role="alert"><CircleAlert className="mt-0.5 size-4 shrink-0" />{state.error}</p>
  ) : (
    <p className="flex items-start gap-1.5 text-sm text-green-700" role="status"><Check className="mt-0.5 size-4 shrink-0" />{state.ok}</p>
  );
}

function Field({ label, htmlFor, children, className }: { label: string; htmlFor: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`grid gap-2 ${className ?? ""}`}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

export function CopyButton({ text, label, iconOnly = false, className }: { text: string; label: string; iconOnly?: boolean; className?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <Button
      type="button"
      variant={iconOnly ? "ghost" : "outline"}
      size={iconOnly ? "icon-sm" : "sm"}
      className={className}
      title={iconOnly ? (copied ? "Copied" : label) : undefined}
      aria-label={iconOnly ? label : undefined}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        } catch {
          window.prompt("Copy with Ctrl+C", text);
        }
      }}
    >
      {copied ? <Check className={iconOnly ? "text-green-700" : undefined} /> : <Copy />}
      <span aria-live="polite" className={iconOnly ? "sr-only" : undefined}>{copied ? "Copied" : label}</span>
    </Button>
  );
}

export function StepButton({ leadId, stepId, label, undo = false }: { leadId: number; stepId: number; label: string; undo?: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(markStepSent, null);
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="stepId" value={stepId} />
      {undo && <input type="hidden" name="undo" value="1" />}
      {undo ? (
        <Button variant="ghost" size="xs" disabled={pending} title="Mark this step as not sent"><Undo2 /> {label}</Button>
      ) : (
        <Button size="sm" disabled={pending}><Check /> {pending ? "Saving…" : label}</Button>
      )}
      {state?.error && <Status state={state} />}
    </form>
  );
}

export function LogCallForm({ leadId, phones, today, outcomes }: { leadId: number; phones: { label: string; number: string }[]; today: string; outcomes: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(logCall, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) form.current?.reset(); }, [state]);
  const id = (k: string) => `call-${leadId}-${k}`;
  return (
    <form ref={form} action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="leadId" value={leadId} />
      <Field label="Number called" htmlFor={id("phone")}>
        <NativeSelect id={id("phone")} name="phone" className="w-full" defaultValue={phones[0] ? `${phones[0].label} ${phones[0].number}` : ""}>
          {phones.map((p) => <NativeSelectOption key={p.label} value={`${p.label} ${p.number}`}>{p.label} · {p.number}</NativeSelectOption>)}
          <NativeSelectOption value="Other number">Other number</NativeSelectOption>
        </NativeSelect>
      </Field>
      <Field label="Outcome" htmlFor={id("outcome")}>
        <NativeSelect id={id("outcome")} name="outcome" required className="w-full" defaultValue="">
          <NativeSelectOption value="" disabled>Choose…</NativeSelectOption>
          {outcomes.map((o) => <NativeSelectOption key={o}>{o}</NativeSelectOption>)}
        </NativeSelect>
      </Field>
      <Field label="Notes" htmlFor={id("notes")} className="sm:col-span-2">
        <Textarea id={id("notes")} name="notes" rows={2} maxLength={4000} placeholder="What was said, who you spoke to, what's next" />
      </Field>
      <Field label="Callback date (optional)" htmlFor={id("cb")}>
        <Input id={id("cb")} type="date" name="callback" min={today} />
      </Field>
      <div className="flex items-end">
        <Button disabled={pending}>{pending ? "Saving…" : "Save call"}</Button>
      </div>
      <div className="sm:col-span-2"><Status state={state} /></div>
    </form>
  );
}

export function NoteForm({ leadId }: { leadId: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addNote, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) form.current?.reset(); }, [state]);
  return (
    <form ref={form} action={action} className="grid gap-2">
      <input type="hidden" name="leadId" value={leadId} />
      <Label htmlFor={`note-${leadId}`} className="sr-only">Add a comment</Label>
      <Textarea id={`note-${leadId}`} name="body" rows={3} maxLength={4000} placeholder="Add a comment for the team" required />
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending}>{pending ? "Saving…" : "Save comment"}</Button>
        <Status state={state} />
      </div>
    </form>
  );
}

/**
 * For forms keyed on the values they change: a successful save remounts them and clears their state,
 * so the confirmation goes to the toast, which lives outside the form.
 */
export function toastOnSuccess(fn: (prev: FormState, form: FormData) => Promise<FormState>) {
  return async (prev: FormState, form: FormData) => {
    const result = await fn(prev, form);
    if (result?.ok) toast(result.ok);
    return result;
  };
}

export function LeadSettingsForm({ leadId, status, disposition, channelPlan }: { leadId: number; status: string; disposition: string; channelPlan: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(toastOnSuccess(updateLeadSettings), null);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-3">
      <input type="hidden" name="leadId" value={leadId} />
      <Field label="Lead status" htmlFor={`st-${leadId}`}>
        <NativeSelect id={`st-${leadId}`} name="status" className="w-full" defaultValue={status}>
          {LEAD_STATUSES.map((s) => <NativeSelectOption key={s}>{s}</NativeSelectOption>)}
        </NativeSelect>
      </Field>
      <Field label="Disposition" htmlFor={`dp-${leadId}`}>
        <NativeSelect id={`dp-${leadId}`} name="disposition" className="w-full" defaultValue={disposition}>
          {DISPOSITIONS.map((s) => <NativeSelectOption key={s}>{s}</NativeSelectOption>)}
        </NativeSelect>
      </Field>
      <Field label="Step 1 channels" htmlFor={`cp-${leadId}`}>
        <NativeSelect id={`cp-${leadId}`} name="channelPlan" className="w-full" defaultValue={channelPlan}>
          {CHANNEL_PLANS.map((s) => <NativeSelectOption key={s}>{s}</NativeSelectOption>)}
        </NativeSelect>
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <Button disabled={pending}>{pending ? "Saving…" : "Save status"}</Button>
        {state?.error && <Status state={state} />}
      </div>
    </form>
  );
}

export function AssignForm({ leadId, users, painPoints, ownerId, painPoint, capacity }: { leadId: number; users: { id: number; name: string }[]; painPoints: string[]; ownerId: number | null; painPoint: string; capacity?: Capacity | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(toastOnSuccess(assignLeads), null);
  const [chosen, setChosen] = useState(ownerId ? String(ownerId) : "");
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="ids" value={leadId} />
      <Field label="Owner" htmlFor={`ow-${leadId}`}>
        <NativeSelect id={`ow-${leadId}`} name="ownerId" required className="w-full" value={chosen} onChange={(e) => setChosen(e.target.value)}>
          <NativeSelectOption value="" disabled>Choose…</NativeSelectOption>
          {users.map((u) => <NativeSelectOption key={u.id} value={u.id}>{u.name}</NativeSelectOption>)}
        </NativeSelect>
      </Field>
      <Field label="Step 1 pain point" htmlFor={`pp-${leadId}`}>
        <NativeSelect id={`pp-${leadId}`} name="painPoint" required className="w-full" defaultValue={painPoints.includes(painPoint) ? painPoint : ""}>
          <NativeSelectOption value="" disabled>Choose…</NativeSelectOption>
          {painPoints.map((p) => <NativeSelectOption key={p}>{p}</NativeSelectOption>)}
        </NativeSelect>
      </Field>
      {capacity && chosen && (
        <CapacityNote className="sm:col-span-2" capacity={capacity} ownerId={Number(chosen)} ownerName={users.find((u) => String(u.id) === chosen)?.name} adding={Number(chosen) === ownerId ? 0 : 1} />
      )}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button disabled={pending}>{pending ? "Saving…" : ownerId ? "Reassign" : "Assign and start"}</Button>
        {state?.error && <Status state={state} />}
      </div>
    </form>
  );
}
