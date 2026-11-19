import Link from "next/link";
import { PhoneCall, ThumbsUp, X, PhoneOff } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { callOutcomeCounts, leadName, listCallOutcomes, listCalls, PAGE_SIZE, pageSizeOf } from "@/lib/data";
import { dateTime, shortDate } from "@/lib/dates";
import { first, withParams, type Params } from "@/lib/url";
import { clampPage } from "@/lib/paging";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar } from "./avatar";
import { OutcomeBadge } from "./badges";
import { LeadPanelHost } from "./lead-panel-host";
import { FilterSelect, SearchBox } from "./list-tools";
import { DataTable, EmptyState, Page, Segments, StatCard, StatGrid, TH, Toolbar } from "./page";
import { Pager } from "./pager";
import { RowActions } from "./row-actions";
import { RowNav } from "./row-nav";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const POSITIVE = ["Interested", "Email requested", "Meeting booked"];
const NO_CONTACT = ["No answer", "Left voicemail", "Gatekeeper", "Wrong number"];

/**
 * Every logged call. Two old tabs read the same records:
 * "history" (Recorded Call History) searches and can narrow to one lead;
 * "pipeline" (Call Pipeline) is organised by call outcome.
 */
export async function CallsPage({ mode, searchParams }: { mode: "history" | "pipeline"; searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const path = mode === "pipeline" ? "/pipeline" : "/calls";
  const q = first(sp.q).slice(0, 100);
  const outcomes = await listCallOutcomes();
  const outcome = outcomes.includes(first(sp.outcome)) ? first(sp.outcome) : "";
  const forId = mode === "history" ? Number(first(sp.for)) || null : null;
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const size = pageSizeOf(first(sp.size));
  const leadId = Number(first(sp.lead)) || null;
  const params: Params = { q, outcome, for: forId ? String(forId) : undefined, page: page > 1 ? String(page) : undefined, size: size === PAGE_SIZE ? undefined : String(size) };

  const [{ rows, total }, forName, counts] = await Promise.all([
    listCalls(user, { q, outcome, leadId: forId, page, size }),
    forId ? leadName(user, forId) : Promise.resolve(null),
    callOutcomeCounts(user),
  ]);
  clampPage(page, total, size, params, path, { lead: leadId ? String(leadId) : undefined });
  const hrefFor = (id: number) => withParams(params, { lead: String(id) }, path);
  const leadIds = [...new Set(rows.map((r) => r.leadId))];
  const title = mode === "pipeline" ? "Call Pipeline" : "Recorded Call History";
  const allCalls = Object.values(counts).reduce((n, c) => n + c, 0);
  const sumOf = (list: string[]) => list.reduce((n, o) => n + (counts[o] ?? 0), 0);

  return (
    <Page>
      <Toolbar
        left={<SearchBox q={q} placeholder="Search lead, phone, outcome or notes…" />}
        right={
          <>
            {forId && (
              <Button variant="secondary" size="sm" className="h-8" asChild>
                <Link href={withParams(params, { for: undefined, page: undefined }, path)} title="Show all recorded calls">Calls with {forName ?? "this lead"} <X /></Link>
              </Button>
            )}
            {mode === "history" && (
              <FilterSelect name="outcome" label="Outcome" value={outcome} any="All outcomes" options={outcomes.map((o) => ({ value: o, label: o }))} />
            )}
          </>
        }
      />

      <StatGrid>
        <StatCard icon={PhoneCall} tone="blue" title="Calls logged" value={allCalls} note="On leads you can see" />
        <StatCard icon={ThumbsUp} tone="green" title="Positive outcomes" value={sumOf(POSITIVE)} note="Interested, email requested or meeting booked" href="/interested" linkLabel="Open Interested Leads" />
        <StatCard icon={PhoneOff} tone="rose" title="No contact" value={sumOf(NO_CONTACT)} note="No answer, voicemail, gatekeeper or wrong number" />
      </StatGrid>

      <div className="grid gap-3">
        {mode === "pipeline" && (
          <Segments
            label="Call outcome"
            items={[{ value: "", label: "All", n: allCalls }, ...outcomes.map((o) => ({ value: o, label: o, n: counts[o] ?? 0 }))].map(({ value, label, n }) => ({
              label, count: n, href: withParams({ q, size: params.size }, { outcome: value || undefined }, path), active: outcome === value,
            }))}
          />
        )}
        {rows.length === 0 ? (
          <EmptyState title={q || outcome ? "No calls match" : forId ? "No calls logged with this lead" : "No calls logged yet"}>
            {q || outcome ? "Try a different search or outcome." : "Calls appear here as soon as anyone logs one from a lead."}
          </EmptyState>
        ) : (
          <DataTable>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(TH, "pl-4")}>Lead</TableHead>
                <TableHead className={cn(TH, "hidden sm:table-cell")}>Call date</TableHead>
                <TableHead className={TH}>{mode === "pipeline" ? "Disposition" : "Outcome"}</TableHead>
                <TableHead className={cn(TH, "hidden md:table-cell")}>Owner</TableHead>
                <TableHead className={cn(TH, "hidden md:table-cell")}>Callback</TableHead>
                <TableHead className={cn(TH, "hidden xl:table-cell")}>Phone</TableHead>
                <TableHead className={cn(TH, "hidden lg:table-cell")}>Notes</TableHead>
                <TableHead className={cn(TH, "w-28 pr-4 text-right")}>Action</TableHead>
              </TableRow>
            </TableHeader>
            <RowNav>
              {rows.map((r) => (
                <TableRow key={r.id} data-state={leadId === r.leadId ? "selected" : undefined} className="h-12 cursor-pointer">
                  <TableCell className="pl-4">
                    <div className="flex min-w-40 items-center gap-2.5">
                      <Avatar name={r.leadName} size="sm" />
                      <div className="grid min-w-0 leading-tight">
                        <Link data-primary href={hrefFor(r.leadId)} scroll={false} className="truncate font-medium hover:underline">{r.leadName}</Link>
                        <span className="truncate text-xs text-muted-foreground">{r.company}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden tabular-nums sm:table-cell">{dateTime(r.at)}</TableCell>
                  <TableCell><OutcomeBadge outcome={r.outcome} /></TableCell>
                  <TableCell className="hidden md:table-cell">{r.ownerName ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                  <TableCell className="hidden md:table-cell">{r.callbackOn ? shortDate(r.callbackOn) : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="hidden xl:table-cell">{r.phone || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="hidden max-w-xs whitespace-normal lg:table-cell"><p className="line-clamp-1 text-muted-foreground" title={r.notes || undefined}>{r.notes || "No notes"} <span className="text-muted-foreground/70">· {r.by}</span></p></TableCell>
                  <TableCell className="pr-4"><RowActions name={r.leadName} detailsHref={hrefFor(r.leadId)} leadId={r.leadId} /></TableCell>
                </TableRow>
              ))}
            </RowNav>
          </DataTable>
        )}
      </div>
      <Pager page={page} total={total} size={size} params={params} path={path} noun={["call", "calls"]} />

      {leadId && (
        <LeadPanelHost user={user} leadId={leadId} ids={leadIds} hrefFor={hrefFor} closeHref={withParams(params, {}, path)} listLabel={title} />
      )}
    </Page>
  );
}
