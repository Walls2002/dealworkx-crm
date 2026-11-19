import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown the instant you change page: the sidebar and top bar stay, only this area waits for data.
 * Same shape as the list pages (toolbar, three stat cards, tabs, table) so nothing jumps when the data lands.
 */
export default function Loading() {
  return (
    <div className="flex flex-1 flex-col gap-5 p-4 md:p-6" aria-busy="true" aria-label="Loading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Skeleton className="h-8 w-72" />
        <div className="flex gap-2"><Skeleton className="h-8 w-32" /><Skeleton className="h-8 w-28" /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="grid gap-3 rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2.5"><Skeleton className="size-7 rounded-lg" /><Skeleton className="h-4 w-28" /></div>
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>
      <Skeleton className="h-9 w-80" />
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b px-4 py-3"><Skeleton className="h-3 w-2/3" /></div>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b px-4 py-3.5 last:border-0">
            <Skeleton className="size-6 rounded-full" />
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="ml-auto h-3.5 w-24" />
            <Skeleton className="h-3.5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
