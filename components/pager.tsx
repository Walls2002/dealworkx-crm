import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PAGE_SIZE } from "@/lib/data";
import { withParams, type Params } from "@/lib/url";
import { cn } from "@/lib/utils";

/** 1 2 3 … 15: current, neighbours, first and last. */
function pageList(page: number, pages: number): (number | "…")[] {
  const set = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  if (page <= 3) [2, 3, 4, 5].forEach((p) => p <= pages && set.add(p));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((p, i) => {
    if (i && p - sorted[i - 1] > 1) out.push("…");
    out.push(p);
  });
  return out;
}

/** Previous on the left, numbered pages in the middle, Next on the right. */
export function Pager({ page, total, params, path, noun }: { page: number; total: number; params: Params; path: string; noun: [string, string] }) {
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);
  const href = (p: number) => withParams(params, { page: p > 1 ? String(p) : undefined }, path);
  if (pages === 1) {
    return <p className="text-xs text-muted-foreground tabular-nums">Showing {first}–{last} of {total} {total === 1 ? noun[0] : noun[1]}</p>;
  }
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-2">
      <Button variant="outline" size="sm" asChild={page > 1} disabled={page <= 1}>
        {page > 1 ? <Link href={href(page - 1)}><ChevronLeft /> Previous</Link> : <><ChevronLeft /> Previous</>}
      </Button>
      <div className="flex items-center gap-1">
        {pageList(page, pages).map((p, i) =>
          p === "…" ? (
            <span key={`gap-${i}`} className="grid size-8 place-items-center text-muted-foreground">…</span>
          ) : (
            <Link
              key={p}
              href={href(p)}
              aria-current={p === page ? "page" : undefined}
              className={cn("grid size-8 place-items-center rounded-md text-[13px] tabular-nums hover:bg-muted", p === page && "bg-primary font-medium text-primary-foreground hover:bg-primary/90")}
            >
              {p}
            </Link>
          ),
        )}
      </div>
      <Button variant="outline" size="sm" asChild={page < pages} disabled={page >= pages}>
        {page < pages ? <Link href={href(page + 1)}>Next <ChevronRight /></Link> : <>Next <ChevronRight /></>}
      </Button>
    </nav>
  );
}
