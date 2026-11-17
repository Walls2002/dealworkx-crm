"use client";

import { useSyncExternalStore } from "react";

// One shared minute ticker for every clock on the page.
let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
function subscribe(fn: () => void) {
  listeners.add(fn);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 15_000);
  }
  return () => {
    listeners.delete(fn);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}
const useNow = () => useSyncExternalStore(subscribe, () => now, () => 0);

function readClock(zone: string, at: number) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false }).formatToParts(at);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const hour = Number(get("hour")) % 24;
    const weekday = get("weekday");
    const open = !["Sat", "Sun"].includes(weekday) && hour >= 9 && hour < 17;
    return { time: `${get("hour")}:${get("minute")}`, weekday, open };
  } catch {
    return null;
  }
}

/** The prospect's local time, with a dot that turns green inside business hours (Mon–Fri, 9:00–17:00). */
export function LocalTime({ zone, long = false }: { zone: string; long?: boolean }) {
  const at = useNow();
  if (!zone) return <span className="text-muted-foreground">No timezone</span>;
  // Before the client clock starts: a neutral placeholder, never a "closed" state.
  if (!at) return <span className="inline-block min-w-12" aria-hidden>&nbsp;</span>;
  const c = readClock(zone, at);
  if (!c) return <span className="text-muted-foreground">Unknown timezone</span>;
  const label = c.open ? "business hours" : "outside business hours";
  return (
    <span className={`inline-flex items-center gap-2 tabular-nums ${c.open ? "text-foreground" : "text-muted-foreground"}`} title={`${zone} · ${label}`}>
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${c.open ? "bg-green-500" : "bg-muted-foreground/40"}`} />
      <span>
        {long ? `${c.weekday} ` : ""}
        {c.time}
        {long ? ` · ${label}` : ""}
      </span>
      {!long && <span className="sr-only">, {label}</span>}
    </span>
  );
}
