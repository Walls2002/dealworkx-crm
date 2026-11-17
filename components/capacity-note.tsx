import type { Capacity } from "@/lib/data";
import { cn } from "@/lib/utils";

/**
 * An owner's daily capacity: how many leads they have started today against the admin-set
 * Email and LinkedIn limits (each new lead sends Step 1 on both). Warns, never blocks.
 */
export function CapacityNote({ capacity, ownerId, ownerName, adding = 0, className }: {
  capacity: Capacity;
  ownerId: number | null;
  ownerName?: string;
  adding?: number;
  className?: string;
}) {
  if (!ownerId) return null;
  const used = capacity.used[ownerId] ?? 0;
  const usedLi = capacity.usedLinkedin[ownerId] ?? 0;
  // New assignments start on "Email + LinkedIn", so they add to both counts.
  const channels = ([["Email", capacity.limits.email, used], ["LinkedIn", capacity.limits.linkedin, usedLi]] as const).map(([label, limit, n]) => ({
    label,
    limit,
    n,
    over: limit == null ? 0 : Math.max(0, n + adding - limit),
  }));
  const over = channels.filter((c) => c.over > 0);
  return (
    <p className={cn("flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-muted-foreground", className)} role="status">
      <span>
        <span className="font-medium text-foreground">{ownerName ?? "This owner"}</span> started{" "}
        <span className="font-medium text-foreground tabular-nums">{used}</span> {used === 1 ? "lead" : "leads"} today
      </span>
      {channels.map((c) => (
        <span key={c.label} className="tabular-nums">
          {c.label}: {c.limit == null ? `${c.n} · no limit` : `${c.n} / ${c.limit}`}
        </span>
      ))}
      {over.length > 0 && (
        <span className="font-medium text-destructive">
          {adding > 0 ? `Adding ${adding} goes` : "Already"} {over.map((c) => `${c.over} over the ${c.label}`).join(" and ")} limit
        </span>
      )}
    </p>
  );
}
