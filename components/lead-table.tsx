"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, X } from "lucide-react";
import { toast } from "./toast";
import { assignLeads, bulkSetStatus, type FormState } from "@/lib/actions";
import type { Capacity, LeadRow, Sort } from "@/lib/data";
import { LEAD_STATUSES } from "@/lib/schema";
import { withParams, type Params } from "@/lib/url";
import { cn } from "@/lib/utils";
import { industryLabel } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataTable, TH } from "./page";
import { RowActions } from "./row-actions";
import { ChannelIcon } from "./icons";
import { LocalTime } from "./local-time";
import { Avatar } from "./avatar";
import { CapacityNote } from "./capacity-note";
import { DueBadge, EmailCheckBadge, StatusBadge } from "./badges";

type Props = {
  rows: LeadRow[];
  today: string;
  admin: boolean;
  users: { id: number; name: string }[];
  painPoints: string[];
  capacity: Capacity | null;
  params: Params;
  /** The page the table lives on ("/" for Console, "/leads" for Lead List). */
  path?: string;
  sort: Sort;
  dir: "asc" | "desc";
  openId: number | null;
  hideOwner: boolean;
  variant?: "queue" | "list";
  empty: React.ReactNode;
};

type ColId = "lead" | "company" | "next" | "due" | "time" | "owner" | "status" | "country" | "zone" | "industry" | "actions";
type Col = { id: ColId; key: Sort | null; label: string; className?: string };

// Console: what is owed and when. Lead List: the old sheet columns.
const QUEUE: Col[] = [
  { id: "lead", key: "name", label: "Lead" },
  { id: "status", key: "status", label: "Status", className: "hidden lg:table-cell" },
  { id: "company", key: "company", label: "Company", className: "hidden md:table-cell" },
  { id: "industry", key: null, label: "Industry", className: "hidden 2xl:table-cell" },
  { id: "next", key: null, label: "Next action", className: "hidden lg:table-cell" },
  { id: "due", key: "due", label: "Due" },
  { id: "time", key: null, label: "Their time", className: "hidden xl:table-cell" },
  { id: "owner", key: "owner", label: "Owner", className: "hidden md:table-cell" },
  { id: "actions", key: null, label: "Action", className: "w-28 pr-4 text-right" },
];
const LIST: Col[] = [
  { id: "lead", key: "name", label: "Name" },
  { id: "status", key: "status", label: "Lead status" },
  { id: "company", key: "company", label: "Company", className: "hidden md:table-cell" },
  { id: "industry", key: null, label: "Industry", className: "hidden lg:table-cell" },
  { id: "next", key: null, label: "Current step", className: "hidden lg:table-cell" },
  { id: "country", key: null, label: "Country", className: "hidden md:table-cell" },
  { id: "zone", key: null, label: "Timezone", className: "hidden xl:table-cell" },
  { id: "actions", key: null, label: "Action", className: "w-28 pr-4 text-right" },
];

export function LeadTable({ rows, today, admin, users, painPoints, capacity, params, path = "/", sort, dir, openId, hideOwner, variant = "queue", empty }: Props) {
  const base = variant === "list" ? LIST : QUEUE;
  const columns = hideOwner ? base.filter((c) => c.id !== "owner") : base;
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const ids = useMemo(() => rows.map((r) => r.id), [rows]);
  // Drop selections that left the page (after a filter change or an assignment).
  useEffect(() => setSelected((s) => new Set([...s].filter((id) => ids.includes(id)))), [ids]);

  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someOn = selected.size > 0 && !allOn;
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const open = (id: number) => router.push(withParams(params, { lead: String(id) }, path), { scroll: false });

  if (rows.length === 0) return <>{empty}</>;

  return (
    <>
      <DataTable>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {admin && (
              <TableHead className={cn(TH, "w-10 pl-4")}>
                <Checkbox
                  aria-label="Select all on this page"
                  checked={allOn ? true : someOn ? "indeterminate" : false}
                  onCheckedChange={() => setSelected(allOn ? new Set() : new Set(ids))}
                />
              </TableHead>
            )}
            {columns.map((c, i) => (
              <TableHead key={c.id} className={cn(TH, c.className, !admin && i === 0 && "pl-4")}>
                {c.key ? (
                  <Link
                    href={withParams(params, { sort: c.key === "due" ? undefined : c.key, dir: sort === c.key && dir === "asc" ? "desc" : undefined, page: undefined }, path)}
                    aria-sort={sort === c.key ? (dir === "asc" ? "ascending" : "descending") : undefined}
                    scroll={false}
                    className="-ml-1.5 inline-flex h-7 items-center gap-1 rounded-md px-1.5 hover:bg-muted hover:text-foreground"
                  >
                    {c.label}
                    {sort === c.key ? (dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ArrowUpDown className="size-3 opacity-60" />}
                  </Link>
                ) : c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow
              key={r.id}
              data-state={selected.has(r.id) || openId === r.id ? "selected" : undefined}
              className="h-12 cursor-pointer"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("a, button, input, label, [role=checkbox]")) return;
                open(r.id);
              }}
            >
              {admin && (
                <TableCell className="pl-4">
                  <Checkbox aria-label={`Select ${r.name}`} checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                </TableCell>
              )}
              {columns.map((c, i) => <Cell key={c.id} col={c} r={r} today={today} href={withParams(params, { lead: String(r.id) }, path)} first={!admin && i === 0} />)}
            </TableRow>
          ))}
        </TableBody>
      </DataTable>
      {admin && selected.size > 0 && (
        <BulkBar ids={[...selected]} users={users} painPoints={painPoints} capacity={capacity} onDone={(m) => { setSelected(new Set()); toast(m); }} onClear={() => setSelected(new Set())} />
      )}
    </>
  );
}

function Cell({ col, r, today, href, first }: { col: Col; r: LeadRow; today: string; href: string; first: boolean }) {
  const cls = cn(col.className, first && "pl-4");
  switch (col.id) {
    case "lead":
      return (
        <TableCell className={cls}>
          <div className="flex min-w-44 items-center gap-2.5">
            <Avatar name={r.name} size="sm" />
            <Link href={href} scroll={false} className="truncate font-medium hover:underline" title={r.title || undefined}>{r.name}</Link>
            <EmailCheckBadge status={r.emailStatus} email={r.email} compact />
          </div>
        </TableCell>
      );
    case "company":
      return <TableCell className={cn(cls, "max-w-56 truncate")}>{r.company || <span className="text-muted-foreground">—</span>}</TableCell>;
    case "next":
      return <TableCell className={cls}><NextAction r={r} /></TableCell>;
    case "due":
      return <TableCell className={cls}><DueBadge due={r.nextDue} today={today} /></TableCell>;
    case "time":
      return <TableCell className={cls}><LocalTime zone={r.timezone} /></TableCell>;
    case "owner":
      return (
        <TableCell className={cls}>
          {r.ownerName ? <span className="inline-flex items-center gap-2">{r.ownerName}</span> : <span className="text-muted-foreground">Unassigned</span>}
        </TableCell>
      );
    case "status":
      return <TableCell className={cls}><StatusBadge status={r.status} /></TableCell>;
    case "industry":
      return (
        <TableCell className={cn(cls, "max-w-48 truncate")} title={r.industry ? industryLabel(r.industry) : undefined}>
          {r.industry ? industryLabel(r.industry) : <span className="text-muted-foreground">—</span>}
        </TableCell>
      );
    case "country":
      return <TableCell className={cls}>{r.country || <span className="text-muted-foreground">—</span>}</TableCell>;
    case "actions":
      return (
        <TableCell className={cls}>
          <RowActions name={r.name} detailsHref={href} leadId={r.id} phone={r.phone} email={r.email} linkedin={r.linkedin} />
        </TableCell>
      );
    case "zone":
      return (
        <TableCell className={cls}>
          <div className="grid leading-tight">
            <LocalTime zone={r.timezone} />
            {r.timezone && <span className="text-xs text-muted-foreground">{r.timezone.replaceAll("_", " ")}</span>}
          </div>
        </TableCell>
      );
  }
}

function NextAction({ r }: { r: LeadRow }) {
  if (r.disposition === "Meeting booked") return <Badge variant="outline" className="border-green-300 bg-green-50 text-green-800"><Check /> Meeting booked</Badge>;
  if (r.nextKind) {
    return (
      <span className="inline-flex items-center gap-2">
        <ChannelIcon channel={r.nextChannel} className="size-3.5 text-muted-foreground" />
        {r.nextLabel}
      </span>
    );
  }
  return <span className="text-muted-foreground">{r.ownerId ? (r.status === "Active" ? "Sequence complete" : r.status) : "Not started"}</span>;
}

function BulkBar({ ids, users, painPoints, capacity, onDone, onClear }: { ids: number[]; users: { id: number; name: string }[]; painPoints: string[]; capacity: Capacity | null; onDone: (message: string) => void; onClear: () => void }) {
  const [ownerId, setOwnerId] = useState("");
  const [assignState, assign, assigning] = useActionState<FormState, FormData>(assignLeads, null);
  const [statusState, setStatus, setting] = useActionState<FormState, FormData>(bulkSetStatus, null);
  const error = assignState?.error || statusState?.error;
  useEffect(() => { if (assignState?.ok) onDone(assignState.ok); }, [assignState, onDone]);
  useEffect(() => { if (statusState?.ok) onDone(statusState.ok); }, [statusState, onDone]);

  return (
    <div role="region" aria-label="Bulk actions" className="fixed inset-x-3 bottom-4 z-30 mx-auto flex max-w-fit flex-wrap items-center gap-2 rounded-xl border bg-background p-2 pl-4 shadow-lg animate-in fade-in-0 slide-in-from-bottom-2">
      <span className="text-sm font-medium tabular-nums">{ids.length} selected</span>
      <form action={assign} className="flex flex-wrap items-center gap-2">
        {ids.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
        <NativeSelect name="ownerId" required aria-label="Assign to" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
          <NativeSelectOption value="" disabled>Assign to…</NativeSelectOption>
          {users.map((u) => <NativeSelectOption key={u.id} value={u.id}>{u.name}</NativeSelectOption>)}
        </NativeSelect>
        <NativeSelect name="painPoint" required aria-label="Step 1 pain point" defaultValue="" className="max-w-64">
          <NativeSelectOption value="" disabled>Step 1 pain point…</NativeSelectOption>
          {painPoints.map((p) => <NativeSelectOption key={p}>{p}</NativeSelectOption>)}
        </NativeSelect>
        <Button disabled={assigning}>{assigning ? "Assigning…" : "Assign and start"}</Button>
      </form>
      <span className="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden />
      <form action={setStatus} className="flex items-center gap-2">
        {ids.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
        <NativeSelect name="status" required aria-label="Set status" defaultValue="">
          <NativeSelectOption value="" disabled>Set status…</NativeSelectOption>
          {LEAD_STATUSES.map((s) => <NativeSelectOption key={s}>{s}</NativeSelectOption>)}
        </NativeSelect>
        <Button variant="outline" disabled={setting}>Apply</Button>
      </form>
      <Button variant="ghost" size="icon" onClick={onClear} aria-label="Clear selection"><X /></Button>
      {capacity && ownerId && (
        <CapacityNote className="basis-full" capacity={capacity} ownerId={Number(ownerId)} ownerName={users.find((u) => String(u.id) === ownerId)?.name} adding={ids.length} />
      )}
      {error && <p className="basis-full text-sm text-destructive" role="alert">{error}</p>}
    </div>
  );
}
