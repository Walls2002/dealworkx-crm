import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PAGE_SIZES } from "@/lib/data";
import { withParams, type Params } from "@/lib/url";
import { cn } from "@/lib/utils";
import { PageSizeSelect } from "./page-size";

const fmt = (n: number) => n.toLocaleString("en-US");

/** 1 2 3 … 15: current, neighbours, first and last. */
function pageList(page: number, pages: number): (number | "…")[] {
  const set = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  if (page <= 3) [2, 3, 4, 5].forEach((p) => p <= pages && set.add(p));
  if (page >= pages - 2) [pages - 4, pages - 3, pages - 2].forEach((p) => p >= 1 && set.add(p));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((p, i) => {
    if (i && p - sorted[i - 1] > 1) out.push("…");
    out.push(p);
  });
  return out;
}

/**
 * Under every table: "Showing 1–50 of 14,147", rows per page, then Previous · 1 2 3 … · Next.
 * `pageParam` lets a page carry two pagers (the dashboard's queue uses "qp"); `sizes` false hides the size choice.
 */
export function Pager({ page, total, size, params, path, noun, pageParam = "page", sizes = PAGE_SIZES }: {
  page: number; total: number; size: number; params: Params; path: string; noun: [string, string];
  pageParam?: string; sizes?: readonly number[] | false;
}) {
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(page, pages);
  const first = (current - 1) * size + 1;
  const last = Math.min(current * size, total);
  const href = (p: number) => withParams(params, { [pageParam]: p > 1 ? String(p) : undefined }, path);

  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="tabular-nums">Showing {fmt(first)}–{fmt(last)} of {fmt(total)} {total === 1 ? noun[0] : noun[1]}</span>
        {sizes && total > Math.min(...sizes) && <PageSizeSelect size={size} sizes={sizes} pageParam={pageParam} />}
      </div>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" asChild={current > 1} disabled={current <= 1}>
            {current > 1 ? <Link href={href(current - 1)} scroll={false}><ChevronLeft /> Previous</Link> : <><ChevronLeft /> Previous</>}
          </Button>
          <div className="hidden items-center gap-1 sm:flex">
            {pageList(current, pages).map((p, i) =>
              p === "…" ? (
                <span key={`gap-${i}`} className="grid size-8 place-items-center text-muted-foreground">…</span>
              ) : (
                <Link
                  key={p}
                  href={href(p)}
                  scroll={false}
                  aria-current={p === current ? "page" : undefined}
                  className={cn("grid h-8 min-w-8 place-items-center rounded-md px-1.5 text-[13px] tabular-nums hover:bg-muted", p === current && "bg-primary font-medium text-primary-foreground hover:bg-primary/90")}
                >
                  {fmt(p)}
                </Link>
              ),
            )}
          </div>
          <span className="px-2 text-xs text-muted-foreground tabular-nums sm:hidden">{current} / {fmt(pages)}</span>
          <Button variant="outline" size="sm" asChild={current < pages} disabled={current >= pages}>
            {current < pages ? <Link href={href(current + 1)} scroll={false}>Next <ChevronRight /></Link> : <>Next <ChevronRight /></>}
          </Button>
        </div>
      )}
    </nav>
  );
}
