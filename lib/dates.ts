// "Today" is a calendar date in the team's timezone, not the server's.
export const APP_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Singapore";

export function todayISO(timeZone = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((Date.parse(toISO + "T00:00:00Z") - Date.parse(fromISO + "T00:00:00Z")) / 86_400_000);
}

/** Postgres `date` comes back as a Date (pg) or string (PGlite); normalise to YYYY-MM-DD. */
export function iso(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    const y = value.getFullYear(), m = value.getMonth() + 1, d = value.getDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return String(value).slice(0, 10);
}

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function isValidTimeZone(zone: string): boolean {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** "Today", "Tomorrow", "3 days overdue", "In 4 days", or a short date. */
export function relativeDue(dueISO: string, today: string): { label: string; tone: "overdue" | "today" | "soon" | "later" } {
  const diff = daysBetween(today, dueISO);
  if (diff < 0) return { label: diff === -1 ? "1 day overdue" : `${-diff} days overdue`, tone: "overdue" };
  if (diff === 0) return { label: "Today", tone: "today" };
  if (diff === 1) return { label: "Tomorrow", tone: "soon" };
  if (diff < 7) return { label: `In ${diff} days`, tone: "soon" };
  return { label: shortDate(dueISO), tone: "later" };
}

export function shortDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(isoDate + "T00:00:00Z"));
}

export function dateTime(value: unknown, timeZone = APP_TIMEZONE): string {
  const d = value instanceof Date ? value : new Date(String(value));
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone }).format(d);
}
