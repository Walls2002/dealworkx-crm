"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { GitMerge, UserX } from "lucide-react";
import { dismissDuplicates, mergeLeads, type FormState } from "@/lib/actions";
import type { DuplicateGroup } from "@/lib/data";
import { dateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataTable, TH } from "@/components/page";
import { EmailCheckBadge, Pill, StatusBadge } from "@/components/badges";
import { Status } from "@/components/lead-forms";

/** One group of look-alike leads: pick the one to keep, then merge the rest into it, or mark them as different people. */
export function DuplicateGroupCard({ group }: { group: DuplicateGroup }) {
  // Default keep: the lead with an owner and the most history, else the oldest.
  const best = [...group.leads].sort((a, b) => Number(!!b.ownerName) - Number(!!a.ownerName) || b.activities - a.activities || a.id - b.id)[0];
  const [keep, setKeep] = useState(best.id);
  const [mergeState, merge, merging] = useActionState<FormState, FormData>(mergeLeads, null);
  const [dismissState, dismiss, dismissing] = useActionState<FormState, FormData>(dismissDuplicates, null);
  const ids = group.leads.map((l) => l.id);

  return (
    <section className="grid gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        {group.reasons.map((r) => <Pill key={r} dot="bg-amber-500" className="bg-amber-50 text-amber-800">{r}</Pill>)}
        <span className="text-xs text-muted-foreground">{group.leads.length} leads</span>
      </div>
      <DataTable>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(TH, "w-16 pl-4")}>Keep</TableHead>
            <TableHead className={TH}>Lead</TableHead>
            <TableHead className={TH}>Email</TableHead>
            <TableHead className={cn(TH, "hidden md:table-cell")}>Phone</TableHead>
            <TableHead className={cn(TH, "hidden md:table-cell")}>Owner</TableHead>
            <TableHead className={cn(TH, "hidden lg:table-cell")}>Status</TableHead>
            <TableHead className={cn(TH, "hidden pr-4 text-right lg:table-cell")}>History</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {group.leads.map((l) => (
            <TableRow key={l.id} data-state={keep === l.id ? "selected" : undefined} className="h-12">
              <TableCell className="pl-4">
                <input type="radio" name={`keep-${ids.join("-")}`} aria-label={`Keep ${l.name}`} checked={keep === l.id} onChange={() => setKeep(l.id)} className="size-4 accent-primary" />
              </TableCell>
              <TableCell className="whitespace-normal">
                <Link href={`/?view=all&lead=${l.id}`} className="font-medium hover:underline">{l.name}</Link>
                <div className="text-xs text-muted-foreground">{[l.title, l.company].filter(Boolean).join(" at ")} · added {dateTime(l.createdAt)}</div>
              </TableCell>
              <TableCell className="whitespace-normal">
                <div className="flex flex-wrap items-center gap-1.5">{l.email || <span className="text-muted-foreground">No email</span>} <EmailCheckBadge status={l.emailStatus} email={l.email} compact /></div>
              </TableCell>
              <TableCell className="hidden md:table-cell">{l.phone || <span className="text-muted-foreground">—</span>}</TableCell>
              <TableCell className="hidden md:table-cell">{l.ownerName ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
              <TableCell className="hidden lg:table-cell"><StatusBadge status={l.status} /></TableCell>
              <TableCell className="hidden pr-4 text-right tabular-nums lg:table-cell">{l.activities} {l.activities === 1 ? "entry" : "entries"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </DataTable>
      <div className="flex flex-wrap items-center gap-2">
        <form
          action={merge}
          onSubmit={(e) => {
            if (!confirm(`Merge ${ids.length - 1} lead(s) into the one you chose to keep? Their calls, comments and steps move over and they are deleted. This cannot be undone.`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="keep" value={keep} />
          {ids.filter((id) => id !== keep).map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
          <Button size="sm" disabled={merging || dismissing}><GitMerge /> {merging ? "Merging…" : "Merge into the kept lead"}</Button>
        </form>
        <form action={dismiss}>
          {ids.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
          <Button variant="outline" size="sm" disabled={merging || dismissing}><UserX /> {dismissing ? "Saving…" : "Not duplicates"}</Button>
        </form>
        <Status state={mergeState ?? dismissState} />
      </div>
    </section>
  );
}
