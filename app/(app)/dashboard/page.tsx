import Link from "next/link";
import { AlarmClock, CalendarCheck, CalendarDays, Eye, Inbox, PhoneCall, Zap } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { dashboard, listCallOutcomes } from "@/lib/data";
import { APP_TIMEZONE, dateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
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

export default async function DashboardPage() {
  const user = await requireUser();
  const [d, outcomeList] = await Promise.all([dashboard(user), listCallOutcomes()]);
  const admin = user.role === "admin";
  const dayLabel = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(d.today + "T00:00:00Z"));
  const sum = (k: "callsToday" | "stepsToday") => d.reps.reduce((n, r) => n + r[k], 0);

  // Every outcome gets a row, zero or not, so the chart keeps its shape day to day.
  const byOutcome = outcomeList.map((o) => ({ outcome: o, n: d.outcomes.find((x) => x.outcome === o)?.n ?? 0 }));
  const peak = Math.max(1, ...byOutcome.map((o) => o.n));

  return (
    <Page>
      <Toolbar
        left={<p className="text-sm text-muted-foreground">Totals cover only the leads you can access · {APP_TIMEZONE}</p>}
        right={<span className="inline-flex h-8 items-center gap-2 rounded-md border px-3 text-[13px]"><CalendarDays className="size-3.5 text-muted-foreground" /> {dayLabel}</span>}
      />

      {/* The six cards of the old Daily Dashboard, in the same order. */}
      <StatGrid>
        <StatCard icon={Eye} tone="blue" title="Visible leads" value={d.totals.visible} note="Leads you can access" href="/?view=all" />
        <StatCard icon={Inbox} tone="violet" title="Unassigned" value={d.totals.unassigned} note="Waiting in the Lead List" href="/leads" />
        <StatCard icon={Zap} tone="green" title="Active leads" value={d.totals.active} note="Sequence running" href="/?view=assigned" />
        <StatCard icon={CalendarCheck} tone="amber" title="Due today" value={d.totals.due_today} note="Steps and callbacks due today" href="/?view=due" />
        <StatCard icon={AlarmClock} tone="rose" title="Overdue" value={d.totals.overdue} note="Past their due date" href="/?view=overdue" />
        <StatCard icon={PhoneCall} tone="slate" title="Calls today" value={d.callsToday} note="Logged since midnight" href="/calls" />
      </StatGrid>

      <div className="grid gap-5 xl:grid-cols-5">
        <Section
          className="xl:col-span-3"
          title="Due and overdue leads"
          note={`${d.queueTotal} ${d.queueTotal === 1 ? "lead" : "leads"} owed now`}
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
                    <TableCell><DueBadge due={r.nextDue} today={d.today} /></TableCell>
                    <TableCell className="hidden pr-4 lg:table-cell"><StatusBadge status={r.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </DataTable>
          )}
          {d.queueTotal > d.queue.length && (
            <Link href={admin ? "/?view=overdue" : "/"} className="text-[13px] font-medium text-primary hover:underline">See all {d.queueTotal} in the Console</Link>
          )}
        </Section>

        <Section className="xl:col-span-2" title="Today's call dispositions" note={`${d.callsToday} ${d.callsToday === 1 ? "call" : "calls"} logged today`}>
          <div className="rounded-xl border bg-card p-4">
            {d.callsToday === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No calls logged yet today.</p>
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
                  <caption>Calls logged today by outcome</caption>
                  <tbody>{byOutcome.map((o) => <tr key={o.outcome}><th scope="row">{o.outcome}</th><td>{o.n}</td></tr>)}</tbody>
                </table>
              </>
            )}
          </div>
        </Section>
      </div>

      <div className="grid gap-5 xl:grid-cols-5">
        {admin && (
          <Section className="xl:col-span-3" title="Team today" note="Calls and steps count from midnight">
            <DataTable>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(TH, "pl-4")}>Owner</TableHead>
                  <TableHead className={cn(TH, "text-right")}>Calls</TableHead>
                  <TableHead className={cn(TH, "text-right")}>Steps sent</TableHead>
                  <TableHead className={cn(TH, "text-right")}>Due today</TableHead>
                  <TableHead className={cn(TH, "text-right")}>Overdue</TableHead>
                  <TableHead className={cn(TH, "hidden text-right sm:table-cell")}>Active</TableHead>
                  <TableHead className={cn(TH, "hidden pr-4 text-right sm:table-cell")}>Meetings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.reps.map((r) => (
                  <TableRow key={r.id} className="h-12">
                    <TableCell className="pl-4"><span className="inline-flex items-center gap-2.5"><Avatar name={r.name} size="sm" /><span className="font-medium">{r.name}</span></span></TableCell>
                    {[r.callsToday, r.stepsToday, r.dueToday].map((n, i) => <TableCell key={i} className={cn("text-right tabular-nums", !n && "text-muted-foreground")}>{n}</TableCell>)}
                    <TableCell className={cn("text-right tabular-nums", r.overdue ? "font-medium text-rose-600" : "text-muted-foreground")}>{r.overdue}</TableCell>
                    <TableCell className={cn("hidden text-right tabular-nums sm:table-cell", !r.active && "text-muted-foreground")}>{r.active}</TableCell>
                    <TableCell className={cn("hidden pr-4 text-right tabular-nums sm:table-cell", !r.meetings && "text-muted-foreground")}>{r.meetings}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="pl-4 font-medium">Team total</TableCell>
                  <TableCell className="text-right tabular-nums">{sum("callsToday")}</TableCell>
                  <TableCell className="text-right tabular-nums">{sum("stepsToday")}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.totals.due_today}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", d.totals.overdue > 0 && "text-rose-600")}>{d.totals.overdue}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{d.totals.active}</TableCell>
                  <TableCell className="hidden pr-4 text-right tabular-nums sm:table-cell">{d.totals.meetings}</TableCell>
                </TableRow>
              </TableFooter>
            </DataTable>
          </Section>
        )}

        <Section className={admin ? "xl:col-span-2" : "xl:col-span-5"} title="Latest activity" note="Calls, comments and sent steps">
          {d.recent.length === 0 ? (
            <EmptyState title="Nothing logged yet" />
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
                    <p>{a.kind === "call" ? `Call · ${a.outcome}` : a.kind === "note" ? "Comment added" : a.body}</p>
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
