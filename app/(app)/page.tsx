import Link from "next/link";
import { AlarmClock, ArrowRight, CalendarCheck, ChevronDown, UserPlus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { capacity, filterOptions, getLead, listLeads, zoneOptions, listPainPoints, listUsers, PAGE_SIZE, pageSizeOf, SORTS, viewCounts, VIEWS, type Sort, type View } from "@/lib/data";
import { first, withParams, type Params } from "@/lib/url";
import { clampPage } from "@/lib/paging";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LeadTable } from "@/components/lead-table";
import { FilterSelect, SearchBox } from "@/components/list-tools";
import { LeadPanel } from "@/components/lead-panel";
import { Pager } from "@/components/pager";
import { EmptyState, Page, Segments, StatCard, StatGrid, Toolbar } from "@/components/page";

export const metadata = { title: "Console" };

/** The old console's task-status filter. */
const TASKS: Record<View, string> = {
  today: "My work today",
  due: "Due",
  overdue: "Overdue",
  new: "Newly assigned",
  assigned: "Assigned",
  unassigned: "Unassigned",
  all: "All tasks",
};
/** One click to the first lead of a queue, like the old "Next due / Next overdue" buttons. */
const JUMPS: View[] = ["due", "overdue", "new", "assigned"];

const EMPTY: Record<View, [string, string]> = {
  today: ["Nothing due today", "Every step and callback on your leads is up to date. Try Overdue, or All tasks."],
  due: ["Nothing due today", "No step or callback falls due today. Overdue work is under Overdue."],
  overdue: ["Nothing overdue", "Every step and callback is on time."],
  new: ["No leads assigned today", "Leads show here on the day they are assigned and their sequence starts."],
  assigned: ["No assigned leads", "Leads show here once an admin assigns them an owner."],
  unassigned: ["No unassigned leads", "Every lead has an owner."],
  all: ["No leads yet", "Leads appear here once they are imported."],
};

export default async function ConsolePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const rawView = first(sp.view) === "mine" ? "assigned" : first(sp.view);
  const view = (VIEWS as readonly string[]).includes(rawView) ? (rawView as View) : "today";
  const sort = (SORTS as readonly string[]).includes(first(sp.sort)) ? (first(sp.sort) as Sort) : "due";
  const dir = first(sp.dir) === "desc" ? "desc" : "asc";
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const size = pageSizeOf(first(sp.size));
  const q = first(sp.q).slice(0, 100);
  const owner = first(sp.owner);
  const zone = first(sp.zone).slice(0, 100);
  const industry = first(sp.industry).slice(0, 100);
  const leadId = Number(first(sp.lead)) || null;
  const admin = user.role === "admin";

  const params: Params = {
    view: view === "today" ? undefined : view, q, owner, zone, industry,
    sort: sort === "due" ? undefined : sort, dir: dir === "asc" ? undefined : dir, page: page > 1 ? String(page) : undefined,
    size: size === PAGE_SIZE ? undefined : String(size),
  };

  const [{ rows, total, today }, users, painPoints, lead, options, cap, counts] = await Promise.all([
    listLeads(user, { view, q, owner, status: "", zone, industry, sort, dir, page, size }),
    listUsers(),
    admin ? listPainPoints() : Promise.resolve([] as string[]),
    leadId ? getLead(user, leadId) : Promise.resolve(null),
    filterOptions(user),
    admin ? capacity() : Promise.resolve(null),
    viewCounts(user),
  ]);
  clampPage(page, total, size, params, "/", { lead: leadId ? String(leadId) : undefined });
  const people = users.map((u) => ({ id: u.id, name: u.name }));
  const ids = rows.map((r) => r.id);
  const open = (id: number) => withParams(params, { lead: String(id) });

  // Next lead: the row after the open one, or the top of the queue when none is open.
  const at = lead ? ids.indexOf(lead.id) : -1;
  const nextId = lead ? (at >= 0 ? ids[at + 1] : ids.find((id) => id !== lead.id)) : ids[0];
  const position = lead && at >= 0 ? `${TASKS[view]} · ${((page - 1) * size + at + 1).toLocaleString("en-US")} of ${total.toLocaleString("en-US")}` : TASKS[view];
  const filtered = Boolean(q || owner || zone || industry);
  const segHref = (v: View) => withParams({ q, owner, zone, industry, size: params.size }, { view: v === "today" ? undefined : v });

  return (
    <Page>
      <Toolbar
        left={<SearchBox q={q} placeholder="Search leads in this queue…" />}
        right={
          <>
            {admin && (
              <FilterSelect name="owner" label="Owner" value={owner} any="All owners" options={[{ value: "none", label: "Unassigned" }, ...people.map((u) => ({ value: String(u.id), label: u.name }))]} />
            )}
            {options.zones.length > 0 && (
              <FilterSelect name="zone" label="Timezone" value={zone} any="All timezones" options={zoneOptions(options.zones)} />
            )}
            {options.industries.length > 0 && (
              <FilterSelect name="industry" label="Industry" value={industry} any="All industries" options={options.industries} />
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8">Jump to <ChevronDown /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Open the first lead in</DropdownMenuLabel>
                {JUMPS.map((v) => (
                  <DropdownMenuItem key={v} asChild><Link href={`/next?view=${v}`}>Next {TASKS[v].toLowerCase()}</Link></DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {nextId ? (
              <Button size="sm" className="h-8" asChild><Link href={open(nextId)} scroll={false}>Next lead <ArrowRight /></Link></Button>
            ) : (
              <Button size="sm" className="h-8" disabled>{lead ? "End of this queue" : "Next lead"}</Button>
            )}
          </>
        }
      />

      <StatGrid>
        <StatCard icon={CalendarCheck} tone="blue" title="My work today" value={counts.today} note="Steps and callbacks due on your leads" href="/" />
        <StatCard icon={AlarmClock} tone="rose" title="Overdue" value={counts.overdue} note={admin ? "Across the team" : "On your leads"} href="/?view=overdue" />
        <StatCard icon={UserPlus} tone="amber" title="Newly assigned" value={counts.new} note="Sequence started today" href="/?view=new" />
      </StatGrid>

      <div className="grid gap-3">
        <Segments
          label="Task status"
          items={VIEWS.map((v) => ({ label: TASKS[v], href: segHref(v), active: view === v, count: counts[v] }))}
        />
        <LeadTable
          rows={rows}
          today={today}
          admin={admin}
          users={people}
          painPoints={painPoints}
          capacity={cap}
          params={params}
          path="/"
          sort={sort}
          dir={dir}
          openId={lead?.id ?? null}
          hideOwner={!admin && view !== "all" && view !== "unassigned"}
          empty={
            <EmptyState
              title={filtered ? "No leads match" : EMPTY[view][0]}
              action={filtered ? <Button variant="outline" size="sm" asChild><Link href={withParams({ view: params.view }, {})}>Clear filters</Link></Button> : undefined}
            >
              {filtered ? "Try a different search or clear the filters." : EMPTY[view][1]}
            </EmptyState>
          }
        />
      </div>
      <Pager page={page} total={total} size={size} params={params} path="/" noun={["lead", "leads"]} />

      {leadId && (lead ? (
        <LeadPanel key={lead.id} lead={lead} nextHref={nextId ? open(nextId) : null} position={position} today={today} closeHref={withParams(params, {})} admin={admin} users={people} painPoints={painPoints} capacity={cap} />
      ) : (
        <LeadPanel.Missing closeHref={withParams(params, {})} />
      ))}
    </Page>
  );
}
