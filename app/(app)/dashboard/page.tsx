import Link from "next/link";
import { AlarmClock, CalendarCheck, Eye, Inbox, PhoneCall, RotateCcw, Zap } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { dashboard, DASHBOARD_PERIODS, filterOptions, listCallOutcomes, listUsers, type DashboardPeriod } from "@/lib/data";
import { APP_TIMEZONE, dateTime, daysBetween, isValidISODate, todayISO } from "@/lib/dates";
import { DateFilter } from "@/components/date-filter";
import { FilterSelect } from "@/components/list-tools";
import { cn } from "@/lib/utils";
import { first } from "@/lib/url";
import { Pager } from "@/components/pager";
import { Button } from "@/components/ui/button";
import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar } from "@/components/avatar";
import { DueBadge, StatusBadge } from "@/components/badges";
import { DataTable, EmptyState, Page, StatCard, StatGrid, TH, Toolbar } from "@/components/page";

export const metadata = { title: "Daily Dashboard" };

function Section({ title, note, action, children, className }: { title: string; note?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("grid content-start gap-3", className)}>
      <div className="flex items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {note && <p className="text-xs text-muted-foreground">{note}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

const PERIOD_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];
const short = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const fmtDay = (iso: string) => short.format(new Date(iso + "T00:00:00Z"));

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const admin = user.role === "admin";
  const today = todayISO();
  const qp = Math.max(1, Number(first(sp.qp)) || 1);
  const rawDate = first(sp.date);
  // Any real day within a few years either side of today.
  const date = isValidISODate(rawDate) && Math.abs(daysBetween(today, rawDate)) <= 3 * 366 ? rawDate : today;
  const period = (Object.hasOwn(DASHBOARD_PERIODS, first(sp.period)) ? first(sp.period) : "day") as DashboardPeriod;
  const owner = admin ? Number(first(sp.owner)) || null : null;
  const country = first(sp.country).slice(0, 100);
  const industry = first(sp.industry).slice(0, 100);

  const [d, outcomeList, options, users] = await Promise.all([
    dashboard(user, { date, period, owner, country, industry, queuePage: qp }),
    listCallOutcomes(),
    filterOptions(user),
    admin ? listUsers() : Promise.resolve([]),
  ]);
  const isToday = date === today;
  // How the period reads in notes: "today", "on 24 Nov", "in the last 7 days", "in the 7 days to 24 Nov".
  const when = d.days === 1 ? (isToday ? "today" : `on ${fmtDay(date)}`) : isToday ? `in the last ${d.days} days` : `in the ${d.days} days to ${fmtDay(date)}`;
  const dueTitle = d.days === 1 ? (isToday ? "Due today" : `Due ${fmtDay(date)}`) : `Due, ${d.days} days`;
  const callsTitle = d.days === 1 ? (isToday ? "Calls today" : `Calls ${fmtDay(date)}`) : `Calls, ${d.days} days`;
  const params = {
    date: isToday ? undefined : date, period: period === "day" ? undefined : period,
    owner: owner ? String(owner) : undefined, country: country || undefined, industry: industry || undefined,
  };
  const filtered = Boolean(owner || country || industry || period !== "day" || !isToday);
  const sum = (k: "calls" | "steps") => d.reps.reduce((n, r) => n + r[k], 0);

  // Every outcome gets a row, zero or not, so the chart keeps its shape day to day.
  const byOutcome = outcomeList.map((o) => ({ outcome: o, n: d.outcomes.find((x) => x.outcome === o)?.n ?? 0 }));
  const peak = Math.max(1, ...byOutcome.map((o) => o.n));

  return (
    <Page>
      <div className="grid gap-2">
        <Toolbar
          left={
            <div className="flex flex-wrap items-center gap-2">
              <DateFilter value={date} today={today} clears={["qp"]} />
              <FilterSelect name="period" label="Period" value={period === "day" ? "" : period} any="Single day" options={PERIOD_OPTIONS} clears={["qp"]} />
            </div>
          }
          right={
            <>
              {admin && (
                <FilterSelect name="owner" label="Owner" value={owner ? String(owner) : ""} any="All owners" options={users.map((u) => ({ value: String(u.id), label: u.name }))} clears={["qp"]} />
              )}
              {options.countries.length > 0 && (
                <FilterSelect name="country" label="Country" value={country} any="All countries" options={options.countries.map((c) => ({ value: c, label: c }))} clears={["qp"]} />
              )}
              {options.industries.length > 0 && (
                <FilterSelect name="industry" label="Industry" value={industry} any="All industries" options={options.industries} clears={["qp"]} />
              )}
              {filtered && (
                <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" asChild><Link href="/dashboard" scroll={false}><RotateCcw /> Reset</Link></Button>
              )}
            </>
          }
        />
        <p className="text-xs text-muted-foreground">
          Activity {when}{d.days > 1 && ` (${fmtDay(d.from)} – ${fmtDay(date)})`} · totals cover only the leads you can access · {APP_TIMEZONE}
        </p>
      </div>

      {/* The six cards of the old Daily Dashboard, in the same order. */}
      <StatGrid>
        <StatCard icon={Eye} tone="blue" title="Visible leads" value={d.totals.visible} note="Leads you can access" href="/?view=all" />
        <StatCard icon={Inbox} tone="violet" title="Unassigned" value={d.totals.unassigned} note="Waiting in the Lead List" href="/leads" />
        <StatCard icon={Zap} tone="green" title="Active leads" value={d.totals.active} note="Sequence running" href="/?view=assigned" />
        <StatCard icon={CalendarCheck} tone="amber" title={dueTitle} value={d.totals.due} note={`Steps and callbacks due ${when}`} href="/?view=due" />
        <StatCard icon={AlarmClock} tone="rose" title="Overdue" value={d.totals.overdue} note="Past their due date, as of now" href="/?view=overdue" />
        <StatCard icon={PhoneCall} tone="slate" title={callsTitle} value={d.calls} note={`Logged ${when}`} href="/calls" />
      </StatGrid>

      <div className="grid gap-5 xl:grid-cols-5">
        <Section
          className="xl:col-span-3"
          title="Due and overdue leads"
          note={`${d.queueTotal} ${d.queueTotal === 1 ? "lead" : "leads"} owed ${isToday ? "now" : `by ${fmtDay(date)}`}`}
          action={<Button variant="outline" size="sm" className="h-8" asChild><Link href={admin ? "/?view=overdue" : "/"}>Open in Console</Link></Button>}
        >
          {d.queue.length === 0 ? (
            <EmptyState title="Nothing is owed right now">Every step and callback is on time.</EmptyState>
          ) : (
            <DataTable>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(TH, "pl-4")}>Lead</TableHead>
                  {admin && <TableHead className={cn(TH, "hidden md:table-cell")}>Owner</TableHead>}
                  <TableHead className={cn(TH, "hidden sm:table-cell")}>Step</TableHead>
                  <TableHead className={TH}>Due</TableHead>
                  <TableHead className={cn(TH, "hidden pr-4 lg:table-cell")}>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.queue.map((r) => (
                  <TableRow key={r.id} className="h-12">
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={r.name} size="sm" />
                        <Link href={`/?view=all&lead=${r.id}`} className="font-medium hover:underline">{r.name}</Link>
                      </div>
                    </TableCell>
                    {admin && <TableCell className="hidden md:table-cell">{r.ownerName}</TableCell>}
                    <TableCell className="hidden sm:table-cell">{r.nextLabel || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell><DueBadge due={r.nextDue} today={today} /></TableCell>
                    <TableCell className="hidden pr-4 lg:table-cell"><StatusBadge status={r.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </DataTable>
          )}
          <Pager page={qp} total={d.queueTotal} size={d.queueSize} params={{ ...params, qp: qp > 1 ? String(qp) : undefined }} path="/dashboard" pageParam="qp" sizes={false} noun={["lead", "leads"]} />
        </Section>

        <Section className="xl:col-span-2" title="Call dispositions" note={`${d.calls} ${d.calls === 1 ? "call" : "calls"} logged ${when}`}>
          <div className="rounded-xl border bg-card p-4">
            {d.calls === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">{isToday && d.days === 1 ? "No calls logged yet today." : `No calls logged ${when}.`}</p>
            ) : (
              <>
                <ul className="grid gap-3" aria-hidden>
                  {byOutcome.map((o) => (
                    <li key={o.outcome} className="grid grid-cols-[8.5rem_1fr_2rem] items-center gap-3 text-[13px]" title={`${o.outcome}: ${o.n}`}>
                      <span className="truncate text-muted-foreground">{o.outcome}</span>
                      <span className="h-2 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${(o.n / peak) * 100}%` }} />
                      </span>
                      <span className={cn("text-right tabular-nums", o.n ? "font-medium" : "text-muted-foreground")}>{o.n}</span>
                    </li>
                  ))}
                </ul>
                <table className="sr-only">
                  <caption>Calls logged {when} by outcome</caption>
                  <tbody>{byOutcome.map((o) => <tr key={o.outcome}><th scope="row">{o.outcome}</th><td>{o.n}</td></tr>)}</tbody>
                </table>
              </>
            )}
          </div>
        </Section>
      </div>

      <div className="grid gap-5 xl:grid-cols-5">
        {admin && (
          <Section className="xl:col-span-3" title="Team" note={`Calls, steps sent and leads due ${when}`}>
            <DataTable>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(TH, "pl-4")}>Owner</TableHead>
                  <TableHead className={cn(TH, "text-right")}>Calls</TableHead>
                  <TableHead className={cn(TH, "text-right")}>Steps sent</TableHead>
                  <TableHead className={cn(TH, "text-right")}>Due</TableHead>
                  <TableHead className={cn(TH, "text-right")}>Overdue</TableHead>
                  <TableHead className={cn(TH, "hidden text-right sm:table-cell")}>Active</TableHead>
                  <TableHead className={cn(TH, "hidden pr-4 text-right sm:table-cell")}>Meetings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.reps.map((r) => (
                  <TableRow key={r.id} className="h-12">
                    <TableCell className="pl-4"><span className="inline-flex items-center gap-2.5"><Avatar name={r.name} size="sm" /><span className="font-medium">{r.name}</span></span></TableCell>
                    {[r.calls, r.steps, r.due].map((n, i) => <TableCell key={i} className={cn("text-right tabular-nums", !n && "text-muted-foreground")}>{n}</TableCell>)}
                    <TableCell className={cn("text-right tabular-nums", r.overdue ? "font-medium text-rose-600" : "text-muted-foreground")}>{r.overdue}</TableCell>
                    <TableCell className={cn("hidden text-right tabular-nums sm:table-cell", !r.active && "text-muted-foreground")}>{r.active}</TableCell>
                    <TableCell className={cn("hidden pr-4 text-right tabular-nums sm:table-cell", !r.meetings && "text-muted-foreground")}>{r.meetings}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="pl-4 font-medium">Team total</TableCell>
                  <TableCell className="text-right tabular-nums">{sum("calls")}</TableCell>
                  <TableCell className="text-right tabular-nums">{sum("steps")}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.totals.due}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", d.totals.overdue > 0 && "text-rose-600")}>{d.totals.overdue}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{d.totals.active}</TableCell>
                  <TableCell className="hidden pr-4 text-right tabular-nums sm:table-cell">{d.totals.meetings}</TableCell>
                </TableRow>
              </TableFooter>
            </DataTable>
          </Section>
        )}

        <Section className={admin ? "xl:col-span-2" : "xl:col-span-5"} title="Latest activity" note={`Calls, comments, emails and sent steps ${when}`}>
          {d.recent.length === 0 ? (
            <EmptyState title={`Nothing logged ${when}`} />
          ) : (
            <ul className="divide-y rounded-xl border bg-card">
              {d.recent.map((a) => (
                <li key={a.id} className="flex gap-3 px-4 py-3 text-[13px]">
                  <Avatar name={a.userName} size="sm" />
                  <div className="min-w-0">
                    <p>
                      <Link href={`/?view=all&lead=${a.leadId}`} className="font-medium hover:underline">{a.leadName}</Link>
                      <span className="text-muted-foreground">, {a.company}</span>
                    </p>
                    <p>{a.kind === "call" ? `Call · ${a.outcome}` : a.kind === "note" ? "Comment added" : a.kind === "email" ? `Email sent${a.outcome ? ` · ${a.outcome}` : ""}` : a.body}</p>
                    <p className="text-xs text-muted-foreground">{a.userName} · {dateTime(a.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </Page>
  );
}
