import { relativeDue } from "@/lib/dates";
import { emailCheck } from "@/lib/dedupe";
import { cn } from "@/lib/utils";

/** The reference's role pill: grey background, coloured dot, label. */
export function Pill({ dot, children, className }: { dot?: string; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs whitespace-nowrap text-muted-foreground", className)}>
      {dot && <span className={cn("size-1.5 rounded-full", dot)} aria-hidden />}
      {children}
    </span>
  );
}

const STATUS_DOT: Record<string, string> = {
  Active: "bg-emerald-500",
  Paused: "bg-amber-500",
  Bad: "bg-rose-500",
  Inactive: "bg-slate-400",
};

export function StatusBadge({ status }: { status: string }) {
  return <Pill dot={STATUS_DOT[status] ?? "bg-slate-400"}>{status}</Pill>;
}

/** Due date: red when overdue, amber today, plain text otherwise. */
export function DueBadge({ due, today }: { due: string | null; today: string }) {
  if (!due) return <span className="text-muted-foreground">—</span>;
  const r = relativeDue(due, today);
  if (r.tone === "overdue") return <Pill dot="bg-rose-500" className="bg-rose-50 text-rose-700">{r.label}</Pill>;
  if (r.tone === "today") return <Pill dot="bg-amber-500" className="bg-amber-50 text-amber-800">{r.label}</Pill>;
  return <span className="text-muted-foreground">{r.label}</span>;
}

const GOOD = new Set(["Interested", "Email requested", "Meeting booked"]);
const BAD = new Set(["Not interested", "Wrong number"]);

/** A call outcome: green when the call moved the lead forward, red when it closed a door. */
export function OutcomeBadge({ outcome }: { outcome: string }) {
  if (GOOD.has(outcome)) return <Pill dot="bg-emerald-500" className="bg-emerald-50 text-emerald-700">{outcome}</Pill>;
  if (BAD.has(outcome)) return <Pill dot="bg-rose-500" className="bg-rose-50 text-rose-700">{outcome}</Pill>;
  return <Pill dot="bg-slate-400">{outcome || "—"}</Pill>;
}

/** Email verification from the upload's Email Status: nothing when verified, amber when unverified, red when invalid. */
export function EmailCheckBadge({ status, email, compact = false }: { status: string; email: string; compact?: boolean }) {
  const check = emailCheck(status, email);
  if (check === "verified") return null;
  const label = check === "invalid" ? "Invalid email" : "Unverified email";
  const tip = check === "invalid" ? "The email failed verification; don't send to it." : `Email status: ${status || "not checked"}`;
  return (
    <Pill dot={check === "invalid" ? "bg-rose-500" : "bg-amber-500"} className={check === "invalid" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}>
      <span title={tip}>{compact ? (check === "invalid" ? "Invalid" : "Unverified") : label}</span>
    </Pill>
  );
}
