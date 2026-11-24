"use client";

import { useRef } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUrlFilter } from "./list-tools";

function shift(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const fmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * A day picker that writes `?date=` (dropped when it is today): step a day either way,
 * open the browser's calendar from the label, or jump back to today.
 */
export function DateFilter({ value, today, clears = [] }: { value: string; today: string; clears?: string[] }) {
  const go = useUrlFilter();
  const input = useRef<HTMLInputElement>(null);
  const set = (v: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
    go({ ...Object.fromEntries(clears.map((k) => [k, ""])), date: v === today ? "" : v });
  };
  const openPicker = () => {
    const el = input.current;
    if (!el) return;
    try { el.showPicker(); } catch { el.focus(); }
  };

  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex h-8 items-center rounded-lg border bg-background dark:border-input dark:bg-input/30">
        <Button variant="ghost" size="icon-sm" className="ml-0.5" aria-label="Previous day" onClick={() => set(shift(value, -1))}><ChevronLeft /></Button>
        <div className="relative">
          <button
            type="button"
            onClick={openPicker}
            className="inline-flex h-7 items-center gap-2 rounded-md px-2 text-[13px] tabular-nums outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label={`Date: ${fmt.format(new Date(value + "T00:00:00Z"))}. Choose another day`}
          >
            <CalendarDays className="size-3.5 text-muted-foreground" />
            {fmt.format(new Date(value + "T00:00:00Z"))}
          </button>
          <input
            ref={input}
            type="date"
            tabIndex={-1}
            aria-hidden
            value={value}
            onChange={(e) => set(e.target.value)}
            className="pointer-events-none absolute inset-x-0 bottom-0 h-0 w-full opacity-0"
          />
        </div>
        <Button variant="ghost" size="icon-sm" className="mr-0.5" aria-label="Next day" onClick={() => set(shift(value, 1))}><ChevronRight /></Button>
      </div>
      {value !== today && (
        <Button variant="outline" size="sm" className="h-8" onClick={() => set(today)}>Today</Button>
      )}
    </div>
  );
}
