import Link from "next/link";
import { AlarmClock, CalendarClock, Mail, ThumbsUp } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { FOLLOWUPS, listFollowups, viewCounts, type FollowupKind } from "@/lib/data";
import { dateTime, todayISO } from "@/lib/dates";
import { first, withParams, type Params } from "@/lib/url";
import { cn } from "@/lib/utils";
import { TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar } from "./avatar";
import { DueBadge } from "./badges";
import { LeadPanelHost } from "./lead-panel-host";
import { SearchBox } from "./list-tools";
import { LocalTime } from "./local-time";
import { DataTable, EmptyState, Page, Segments, StatCard, StatGrid, TH, Toolbar } from "./page";
import { RowActions } from "./row-actions";
import { RowNav } from "./row-nav";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Leads whose latest call ended Interested or Email requested: the follow-up tabs from the old app. */
export async function FollowupPage({ kind, searchParams }: { kind: FollowupKind; searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = first(sp.q).slice(0, 100);
  const leadId = Number(first(sp.lead)) || null;
  const path = `/${kind}`;
  const params: Params = { q };
  const { label, outcome } = FOLLOWUPS[kind];
  const [rows, counts] = await Promise.all([listFollowups(user, kind, q), viewCounts(user)]);
  const today = todayISO();
  const admin = user.role === "admin";
  const hrefFor = (id: number) => withParams(params, { lead: String(id) }, path);
  const callbacksDue = rows.filter((r) => r.callbackOn && r.callbackOn <= today).length;
  const callbacksLater = rows.filter((r) => r.callbackOn && r.callbackOn > today).length;

  return (
    <Page>
      <Toolbar left={<SearchBox q={q} placeholder="Search name, company or call notes…" />} />

      <StatGrid>
        <StatCard icon={kind === "interested" ? ThumbsUp : Mail} tone="blue" title={label} value={rows.length} note={`Latest call: ${outcome}`} />
        <StatCard icon={AlarmClock} tone="rose" title="Callbacks due" value={callbacksDue} note="Today or overdue" />
        <StatCard icon={CalendarClock} tone="amber" title="Callbacks booked" value={callbacksLater} note="Scheduled for later" />
      </StatGrid>

      <div className="grid gap-3">
        <Segments
          label="Follow-up lists"
          items={[
            { label: "Interested Leads", href: "/interested", active: kind === "interested", icon: ThumbsUp, count: counts.interested },
            { label: "Email Requested", href: "/email-requested", active: kind === "email-requested", icon: Mail, count: counts.emailRequested },
          ]}
        />
        {rows.length === 0 ? (
          <EmptyState title={q ? "No leads match" : "No leads yet"}>
            {q ? "Try a different search." : `A lead shows here when its latest call is logged as "${outcome}". Log a different outcome later and it leaves this list.`}
          </EmptyState>
        ) : (
          <DataTable>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(TH, "pl-4")}>Name</TableHead>
                <TableHead className={cn(TH, "hidden md:table-cell")}>Company</TableHead>
                {admin && <TableHead className={cn(TH, "hidden md:table-cell")}>Owner</TableHead>}
                <TableHead className={TH}>Last call</TableHead>
                <TableHead className={cn(TH, "hidden sm:table-cell")}>Callback</TableHead>
                <TableHead className={cn(TH, "hidden lg:table-cell")}>Call notes</TableHead>
                <TableHead className={cn(TH, "hidden xl:table-cell")}>Their time</TableHead>
                <TableHead className={cn(TH, "w-28 pr-4 text-right")}>Action</TableHead>
              </TableRow>
            </TableHeader>
            <RowNav>
              {rows.map((r) => (
                <TableRow key={r.id} data-state={leadId === r.id ? "selected" : undefined} className="h-12 cursor-pointer">
                  <TableCell className="pl-4">
                    <div className="flex min-w-40 items-center gap-2.5">
                      <Avatar name={r.name} size="sm" />
                      <Link data-primary href={hrefFor(r.id)} scroll={false} className="truncate font-medium hover:underline">{r.name}</Link>
                    </div>
                  </TableCell>
                  <TableCell className="hidden max-w-52 truncate md:table-cell">{r.company}</TableCell>
                  {admin && <TableCell className="hidden md:table-cell">{r.ownerName ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>}
                  <TableCell className="tabular-nums">{dateTime(r.callAt)} <span className="text-muted-foreground">· {r.callBy}</span></TableCell>
                  <TableCell className="hidden sm:table-cell"><DueBadge due={r.callbackOn} today={today} /></TableCell>
                  <TableCell className="hidden max-w-xs whitespace-normal lg:table-cell"><p className="line-clamp-1 text-muted-foreground">{r.notes || "No notes"}</p></TableCell>
                  <TableCell className="hidden xl:table-cell"><LocalTime zone={r.timezone} /></TableCell>
                  <TableCell className="pr-4"><RowActions name={r.name} detailsHref={hrefFor(r.id)} leadId={r.id} phone={r.phone} email={r.email} /></TableCell>
                </TableRow>
              ))}
            </RowNav>
          </DataTable>
        )}
      </div>

      {leadId && (
        <LeadPanelHost user={user} leadId={leadId} ids={rows.map((r) => r.id)} hrefFor={hrefFor} closeHref={withParams(params, {}, path)} listLabel={label} />
      )}
    </Page>
  );
}
