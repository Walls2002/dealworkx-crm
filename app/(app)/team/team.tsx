"use client";

import { useActionState, useEffect, useRef } from "react";
import { MailPlus, RotateCw, X } from "lucide-react";
import { cancelInvite, inviteMember, resendInvite, setRole, type FormState } from "@/lib/actions";
import type { TeamMember } from "@/lib/data";
import { dateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataTable, TH } from "@/components/page";
import { Pill } from "@/components/badges";
import { Avatar } from "@/components/avatar";
import { CopyButton, Status, toastOnSuccess } from "@/components/lead-forms";

/** The invite link, to copy when the email didn't arrive (or isn't set up). */
function InviteLink({ state }: { state: FormState }) {
  if (!state?.link) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs">
      <span className="text-muted-foreground">Invite link</span>
      <code className="min-w-0 flex-1 truncate font-mono text-[11px]">{state.link}</code>
      <CopyButton text={state.link} label="Copy link" />
    </div>
  );
}

export function InviteForm({ domain }: { domain: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(inviteMember, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) form.current?.reset(); }, [state]);
  return (
    <section className="grid gap-3 rounded-xl border bg-card p-5" aria-labelledby="invite-heading">
      <div>
        <h3 id="invite-heading" className="text-sm font-semibold">Invite a teammate</h3>
        <p className="text-xs text-muted-foreground">They get an email with a link to set their password. The link works for 7 days.</p>
      </div>
      <form ref={form} action={action} className="grid gap-3 sm:grid-cols-[1fr_1.3fr_auto_auto] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="invite-name">Name</Label>
          <Input id="invite-name" name="name" required maxLength={80} placeholder="Full name" autoComplete="off" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="invite-email">Work email</Label>
          <Input id="invite-email" name="email" type="email" required maxLength={200} placeholder={`name@${domain}`} autoComplete="off" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="invite-role">Role</Label>
          <NativeSelect id="invite-role" name="role" defaultValue="rep">
            <NativeSelectOption value="rep">Member</NativeSelectOption>
            <NativeSelectOption value="admin">Admin</NativeSelectOption>
          </NativeSelect>
        </div>
        <Button disabled={pending}><MailPlus /> {pending ? "Sending…" : "Send invite"}</Button>
      </form>
      <Status state={state ? { ok: state.ok, error: state.error } : null} />
      <InviteLink state={state} />
    </section>
  );
}

function RoleSelect({ member, disabled, why }: { member: TeamMember; disabled: boolean; why?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(toastOnSuccess(setRole), null);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} className="grid gap-1">
      <input type="hidden" name="userId" value={member.id} />
      <NativeSelect
        name="role"
        size="sm"
        aria-label={`Role for ${member.name}`}
        title={why}
        defaultValue={member.role}
        disabled={disabled || pending}
        onChange={() => form.current?.requestSubmit()}
        className="w-32"
      >
        <NativeSelectOption value="rep">Member</NativeSelectOption>
        <NativeSelectOption value="admin">Admin</NativeSelectOption>
      </NativeSelect>
      {why && <span className="text-[11px] text-muted-foreground">{why}</span>}
      {state?.error && <Status state={state} />}
    </form>
  );
}

function InviteActions({ member }: { member: TeamMember }) {
  const [resent, resend, resending] = useActionState<FormState, FormData>(resendInvite, null);
  const [cancelled, cancel, cancelling] = useActionState<FormState, FormData>(toastOnSuccess(cancelInvite), null);
  return (
    <div className="grid justify-items-end gap-1.5">
      <div className="flex justify-end gap-1">
        <form action={resend}>
          <input type="hidden" name="userId" value={member.id} />
          <Button variant="outline" size="sm" disabled={resending || cancelling}><RotateCw /> {resending ? "Sending…" : "Resend invite"}</Button>
        </form>
        <form action={cancel} onSubmit={(e) => { if (!confirm(`Cancel the invite for ${member.email}? Their pending account is removed.`)) e.preventDefault(); }}>
          <input type="hidden" name="userId" value={member.id} />
          <Button variant="ghost" size="sm" disabled={resending || cancelling} aria-label={`Cancel invite for ${member.name}`}><X /> Cancel</Button>
        </form>
      </div>
      <Status state={resent ? { ok: resent.ok, error: resent.error } : cancelled?.error ? cancelled : null} />
      {resent?.link && <div className="w-full max-w-md"><InviteLink state={resent} /></div>}
    </div>
  );
}

export function TeamTable({ team, me, lastAdmin }: { team: TeamMember[]; me: number; lastAdmin: boolean }) {
  return (
    <DataTable>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={cn(TH, "pl-4")}>Person</TableHead>
          <TableHead className={TH}>Role</TableHead>
          <TableHead className={cn(TH, "hidden md:table-cell")}>Status</TableHead>
          <TableHead className={cn(TH, "hidden text-right sm:table-cell")}>Leads owned</TableHead>
          <TableHead className={cn(TH, "pr-4 text-right")}><span className="sr-only">Actions</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {team.map((m) => {
          const isMe = m.id === me;
          const why = isMe ? "That's you" : m.role === "admin" && lastAdmin && m.status === "active" ? "Only admin" : undefined;
          return (
            <TableRow key={m.id} className="h-16">
              <TableCell className="pl-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={m.name} />
                  <div className="grid min-w-0 leading-tight">
                    <span className="truncate font-medium">{m.name}{isMe && <span className="font-normal text-muted-foreground"> (you)</span>}</span>
                    <span className="truncate text-xs text-muted-foreground">{m.email}</span>
                  </div>
                </div>
              </TableCell>
              <TableCell><RoleSelect key={m.role} member={m} disabled={Boolean(why)} why={why} /></TableCell>
              <TableCell className="hidden md:table-cell">
                {m.status === "active" ? (
                  <Pill dot="bg-emerald-500">Active</Pill>
                ) : (
                  <span className="grid gap-0.5">
                    <Pill dot={m.inviteExpired ? "bg-rose-500" : "bg-amber-500"} className={m.inviteExpired ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}>
                      {m.inviteExpired ? "Invite expired" : "Invited"}
                    </Pill>
                    {m.invitedAt && <span className="text-[11px] text-muted-foreground">Sent {dateTime(m.invitedAt)}</span>}
                  </span>
                )}
              </TableCell>
              <TableCell className="hidden text-right tabular-nums sm:table-cell">{m.leads.toLocaleString("en-US")}</TableCell>
              <TableCell className="pr-4 text-right whitespace-normal">{m.status === "invited" ? <InviteActions member={m} /> : null}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </DataTable>
  );
}
