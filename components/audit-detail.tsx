import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Readable names for the keys actions write into audit_log.detail. Unknown keys fall back to a sentence-cased key. */
const LABELS: Record<string, string> = {
  to: "To", from: "From", subject: "Subject", message: "Message", jobTitleSubject: "Job-title subject", jobTitleMessage: "Job-title message",
  outcome: "Outcome", phone: "Number called", callback: "Callback set for", previousCallback: "Previous callback", step: "Step",
  signature: "Signature", brevoMessageId: "Brevo message ID", error: "Error", owner: "Assigned to", painPoint: "Pain point",
  count: "Leads", file: "File", sheets: "Sheets", imported: "Imported", setToBad: "Set to Bad (invalid email)", skipped: "Duplicates skipped",
  skippedRows: "Skipped rows", possibleDuplicatesAllowed: "Possible duplicates imported anyway", newLeads: "New leads", duplicates: "Duplicates",
  possibleDuplicates: "Possible duplicates", kept: "Kept", mergedAway: "Merged away", filledIn: "Blank fields filled in",
  added: "Added", removed: "Removed", list: "Full list now", email: "Email", name: "Name", role: "Role", person: "Person",
  ip: "IP address", browser: "Browser", status: "Status", disposition: "Disposition", channelPlan: "Step 1 channels",
  leads: "Leads", source: "Note", updates: "Updates of existing leads", updated: "Existing leads updated",
  matchedWithNothingNew: "Matched, nothing new to update", possibleDuplicatesApplied: "Possible duplicates applied to the existing lead",
  updatedLeads: "Updated leads", unsentStepsCancelled: "Unsent sequence steps cancelled", sequenceResumed: "Sequences resumed from today",
};
/** Long text shown as a message block rather than a field. */
const TEXT = ["message", "jobTitleMessage"];
/** Shown first, in this order. */
const FIRST = ["changes", "to", "from", "subject", "message", "jobTitleSubject", "jobTitleMessage", "error"];
/** Already said by the change list, when there is one. */
const COVERED_BY_CHANGES = ["status", "disposition", "channelPlan"];
/** Shown as a footnote, not a field. */
const NOTE = "source";

const dateOnly = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
/** "2026-11-13" → "13 Nov 2026"; everything else as written. */
function show(v: unknown): string {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return dateOnly.format(new Date(v + "T00:00:00Z"));
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

const label = (k: string) => LABELS[k] ?? k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

type Change = { field: string; from: string; to: string };
type LeadRef = { id?: number; name?: string; email?: string; previousOwner?: string; previousStatus?: string; changed?: string };

function isChangeList(v: unknown): v is Change[] {
  return Array.isArray(v) && v.every((c) => c && typeof c === "object" && "field" in c);
}

/** Everything recorded for one log entry: changes, full message text, recipients, lead lists, and the rest as fields. */
export function AuditDetail({ detail }: { detail: Record<string, unknown> }) {
  const has = (k: string) => detail[k] !== undefined && detail[k] !== null && detail[k] !== "";
  const changeList = isChangeList(detail.changes) ? detail.changes : [];
  const keys = [...FIRST.filter(has), ...Object.keys(detail).filter((k) => !FIRST.includes(k) && has(k))]
    .filter((k) => k !== "changes" && k !== NOTE)
    .filter((k) => !(changeList.length && COVERED_BY_CHANGES.includes(k)));
  const fields = keys.filter((k) => !TEXT.includes(k) && !Array.isArray(detail[k]));
  const texts = keys.filter((k) => TEXT.includes(k));
  const lists = keys.filter((k) => Array.isArray(detail[k]) && (detail[k] as unknown[]).length > 0);
  const note = has(NOTE) ? String(detail[NOTE]) : null;
  if (!changeList.length && !fields.length && !texts.length && !lists.length && !note) return null;

  return (
    <div className="grid gap-3 text-[13px]">
      {changeList.length > 0 && (
        <ul className="grid gap-1" aria-label="Changes">
          {changeList.map((c) => (
            <li key={c.field} className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-muted-foreground">{c.field}</span>
              {c.from.length > 80 || c.to.length > 80 ? (
                <LongChange from={c.from} to={c.to} />
              ) : (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <span className="text-muted-foreground line-through decoration-muted-foreground/50">{c.from || "(blank)"}</span>
                  <ArrowRight className="size-3 text-muted-foreground" aria-label="changed to" />
                  <span className="font-medium">{c.to || "(blank)"}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {fields.length > 0 && (
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1.5 sm:gap-x-6">
          {fields.map((k) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{label(k)}</dt>
              <dd className={cn("min-w-0 [overflow-wrap:anywhere]", k === "browser" && "truncate")} title={k === "browser" ? String(detail[k]) : undefined}>
                {show(detail[k])}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {texts.map((k) => (
        <div key={k} className="grid gap-1">
          <p className="text-muted-foreground">{label(k)}</p>
          <p className="rounded-md bg-muted px-3 py-2 whitespace-pre-wrap [overflow-wrap:anywhere]">{String(detail[k])}</p>
        </div>
      ))}

      {lists.map((k) => <ListField key={k} name={label(k)} items={detail[k] as unknown[]} />)}
      {note && <p className="text-xs text-muted-foreground italic">{note}</p>}
    </div>
  );
}

function LongChange({ from, to }: { from: string; to: string }) {
  return (
    <div className="grid w-full gap-2 sm:grid-cols-2">
      <div className="grid gap-1">
        <span className="text-xs text-muted-foreground">Before</span>
        <p className="rounded-md bg-muted px-3 py-2 whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">{from || "(blank)"}</p>
      </div>
      <div className="grid gap-1">
        <span className="text-xs text-muted-foreground">After</span>
        <p className="rounded-md border px-3 py-2 whitespace-pre-wrap [overflow-wrap:anywhere]">{to || "(blank)"}</p>
      </div>
    </div>
  );
}

/** Short lists inline; long ones (a 200-lead assignment, skipped import rows) folded away. */
function ListField({ name, items }: { name: string; items: unknown[] }) {
  const rendered = items.map((item, i) => {
    if (item && typeof item === "object") {
      const l = item as LeadRef;
      const extra = [l.email, l.previousOwner && `was ${l.previousOwner}`, l.previousStatus && `was ${l.previousStatus}`, l.changed && `changed: ${l.changed}`].filter(Boolean).join(" · ");
      return (
        <li key={l.id ?? i}>
          {l.id ? <Link href={`/?view=all&lead=${l.id}`} className="font-medium hover:underline">{l.name ?? `Lead ${l.id}`}</Link> : <span className="font-medium">{l.name}</span>}
          {extra && <span className="text-muted-foreground"> · {extra}</span>}
        </li>
      );
    }
    return <li key={i} className="[overflow-wrap:anywhere]">{String(item)}</li>;
  });
  if (items.length <= 6) {
    return (
      <div className="grid gap-1">
        <p className="text-muted-foreground">{name}</p>
        <ul className="grid gap-0.5 pl-4 [list-style:disc] marker:text-muted-foreground">{rendered}</ul>
      </div>
    );
  }
  return (
    <details className="rounded-md border">
      <summary className="cursor-pointer px-3 py-1.5 text-muted-foreground">{name} ({items.length.toLocaleString("en-US")})</summary>
      <ul className="grid max-h-72 gap-0.5 overflow-y-auto border-t py-2 pr-3 pl-7 [list-style:disc] marker:text-muted-foreground">{rendered}</ul>
    </details>
  );
}
