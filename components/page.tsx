import Link from "next/link";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Table } from "@/components/ui/table";
import { CardMenu } from "./row-actions";

/** Page body: padding and vertical rhythm shared by every screen. */
export function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-1 flex-col gap-5 p-4 md:p-6", className)}>{children}</div>;
}

/** Search on the left, filters and actions on the right. */
export function Toolbar({ left, right }: { left: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="w-full sm:w-auto">{left}</div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

const TONES = {
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  green: "bg-emerald-500",
  violet: "bg-violet-500",
  slate: "bg-slate-500",
} as const;

/** A stat card: coloured icon tile, title, menu, big number, one line of context. */
export function StatCard({ icon: Icon, tone, title, value, note, href, linkLabel = "Open list" }: {
  icon: LucideIcon; tone: keyof typeof TONES; title: string; value: number | string; note?: React.ReactNode; href?: string; linkLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex items-center gap-2.5">
        <span className={cn("grid size-7 place-items-center rounded-lg text-white", TONES[tone])} aria-hidden><Icon className="size-4" /></span>
        <span className="text-[13px] font-medium">{title}</span>
        {href ? <CardMenu href={href} label={linkLabel} /> : <MoreHorizontal className="ml-auto size-4 text-transparent" aria-hidden />}
      </div>
      <div className="grid gap-1">
        <span className="text-2xl font-semibold tabular-nums">{typeof value === "number" ? value.toLocaleString("en-US") : value}</span>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </div>
    </div>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

/** Segmented tabs ("All Partners | My Partner"), as links. */
export function Segments({ items, label }: { items: { label: string; href: string; active: boolean; icon?: LucideIcon; count?: number }[]; label: string }) {
  return (
    <nav aria-label={label} className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1">
      {items.map(({ label: l, href, active, icon: Icon, count }) => (
        <Link
          key={href}
          href={href}
          scroll={false}
          aria-current={active ? "page" : undefined}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
            active && "bg-background font-medium text-foreground shadow-xs",
          )}
        >
          {Icon && <Icon className="size-3.5" />}
          {l}
          {count !== undefined && <span className="text-xs text-muted-foreground tabular-nums">{count.toLocaleString("en-US")}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** The bordered table frame from the reference. */
export function DataTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table className="text-[13px]">{children}</Table>
    </div>
  );
}

/** Uppercase table header cell class. */
export const TH = "h-10 text-[11px] font-medium tracking-wide text-muted-foreground uppercase";

/** Centred message for an empty table or list. */
export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center">
      <p className="font-medium">{title}</p>
      {children && <p className="max-w-md text-sm text-muted-foreground">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Primary blue action button as a link. */
export function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Button size="sm" className="h-8" asChild><Link href={href} scroll={false}>{children}</Link></Button>;
}

/** Title block for settings-style pages (Sequence, Import). */
export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
