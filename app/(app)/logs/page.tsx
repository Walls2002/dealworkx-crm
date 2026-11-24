import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { DASHBOARD_PERIODS, listAllPeople, listAuditLog, PAGE_SIZE, pageSizeOf, type AuditRow, type DashboardPeriod } from "@/lib/data";
import { addDays, APP_TIMEZONE, daysBetween, isValidISODate, todayISO } from "@/lib/dates";
import { AUDIT_CATEGORIES } from "@/lib/schema";
import { first, withParams } from "@/lib/url";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/avatar";
import { AuditDetail } from "@/components/audit-detail";
import { DateFilter } from "@/components/date-filter";
import { FilterSelect, SearchBox } from "@/components/list-tools";
import { EmptyState, Page, PageHeader, Segments, Toolbar } from "@/components/page";
import { Pager } from "@/components/pager";

export const metadata = { title: "Activity log" };

const PERIOD_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const clock = new Intl.DateTimeFormat("en-GB", { timeZone: APP_TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false });
const longDay = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const shortDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const fmt = (iso: string, f: Intl.DateTimeFormat) => f.format(new Date(iso + "T00:00:00Z"));

/** Admin only: everything every person did in the CRM, admins included, newest first. Defaults to today. */
export default async function ActivityLogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const today = todayISO();
  const rawDate = first(sp.date);
  const date = isValidISODate(rawDate) && Math.abs(daysBetween(today, rawDate)) <= 3 * 366 ? rawDate : today;
  const period = (Object.hasOwn(DASHBOARD_PERIODS, first(sp.period)) ? first(sp.period) : "day") as DashboardPeriod;
  const days = DASHBOARD_PERIODS[period];
  const from = addDays(date, -(days - 1));
  const person = Number(first(sp.person)) || null;
  const cat = (AUDIT_CATEGORIES as readonly string[]).includes(first(sp.cat)) ? first(sp.cat) : "";
  const q = first(sp.q).slice(0, 100);
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const size = pageSizeOf(first(sp.size));

  const [log, people] = await Promise.all([
    listAuditLog({ from, to: date, userId: person, category: cat, q, page, size }),
    listAllPeople(),
  ]);

  const isToday = date === today;
  const when = days === 1 ? (isToday ? "today" : `on ${fmt(date, longDay)}`) : `${fmt(from, shortDay)} – ${fmt(date, shortDay)}`;
  const params = {
    date: isToday ? undefined : date, period: period === "day" ? undefined : period, person: person ? String(person) : undefined,
    cat: cat || undefined, q: q || undefined, size: size === PAGE_SIZE ? undefined : String(size),
  };
  const filtered = Boolean(person || cat || q || period !== "day" || !isToday);
  const all = Object.values(log.byCategory).reduce((n, v) => n + v, 0);

  // Newest first, grouped by day in the team's timezone.
  const groups: { day: string; rows: AuditRow[] }[] = [];
  for (const r of log.rows) {
    const day = dayKey.format(new Date(r.createdAt));
    if (groups.at(-1)?.day !== day) groups.push({ day, rows: [] });
    groups.at(-1)!.rows.push(r);
  }

  return (
    <Page>
      <PageHeader
        title="Activity log"
        description="Everything each person did in the CRM, admins included: sign-ins, calls, comments, emails with their full text, step sends, assignments, uploads, team and setting changes."
      />
      <div className="grid gap-2">
        <Toolbar
          left={<SearchBox q={q} placeholder="Search people, leads, messages…" />}
          right={
            <>
              <DateFilter value={date} today={today} clears={["page"]} />
              <FilterSelect name="period" label="Period" value={period === "day" ? "" : period} any="Single day" options={PERIOD_OPTIONS} clears={["page"]} />
              <FilterSelect name="person" label="Person" value={person ? String(person) : ""} any="Everyone" options={people.map((p) => ({ value: String(p.id), label: `${p.name}${p.role === "admin" ? " (admin)" : ""}` }))} />
              {filtered && (
                <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" asChild><Link href="/logs" scroll={false}><RotateCcw /> Reset</Link></Button>
              )}
            </>
          }
        />
        <p className="text-xs text-muted-foreground">
          {log.total.toLocaleString("en-US")} {log.total === 1 ? "entry" : "entries"} by {log.people} {log.people === 1 ? "person" : "people"} · {when} · times in {APP_TIMEZONE}
        </p>
      </div>

      <Segments
        label="Type of activity"
        items={[{ label: "All", value: "", count: all }, ...AUDIT_CATEGORIES.map((c) => ({ label: c, value: c, count: log.byCategory[c] ?? 0 }))]
          .filter((s) => s.value === "" || s.count > 0 || s.value === cat)
          .map((s) => ({ label: s.label, count: s.count, href: withParams(params, { cat: s.value || undefined }, "/logs"), active: cat === s.value }))}
      />

      {log.rows.length === 0 ? (
        <EmptyState title={`Nothing recorded ${days === 1 ? when : "in this period"}`}>
          {filtered ? "Try another day, a longer period, or clear the filters." : "Activity shows here as soon as someone signs in or works a lead."}
        </EmptyState>
      ) : (
        <div className="grid gap-6">
          {groups.map((g) => (
            <section key={g.day} className="grid gap-2" aria-label={fmt(g.day, longDay)}>
              {(days > 1 || groups.length > 1) && <h2 className="text-sm font-semibold">{fmt(g.day, longDay)}</h2>}
              <ol className="divide-y rounded-xl border bg-card">
                {g.rows.map((r) => (
                  <li key={r.id} className="grid gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[3.25rem_minmax(0,1fr)]">
                    <time dateTime={r.createdAt} className="pt-0.5 text-xs text-muted-foreground tabular-nums">{clock.format(new Date(r.createdAt))}</time>
                    <div className="grid min-w-0 gap-2.5">
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                          <Avatar name={r.userName} size="sm" />
                          <span className="font-medium">{r.userName}</span>
                          <span className="[overflow-wrap:anywhere]">{r.summary}</span>
                          {r.leadName && (
                            <span className="text-muted-foreground">
                              · {r.leadId ? <Link href={`/?view=all&lead=${r.leadId}`} className="font-medium text-foreground hover:underline">{r.leadName}</Link> : r.leadName}
                            </span>
                          )}
                        </p>
                        <Badge variant="outline" className="shrink-0 text-muted-foreground">{r.category}</Badge>
                      </div>
                      <AuditDetail detail={r.detail} />
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
      <Pager page={page} total={log.total} size={size} params={params} path="/logs" noun={["entry", "entries"]} />
    </Page>
  );
}
