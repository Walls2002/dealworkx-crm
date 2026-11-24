import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getLead, listLeads, listPainPoints, listUsers, PAGE_SIZE, pageSizeOf, SORTS, type Sort } from "@/lib/data";
import { first, withParams, type Params } from "@/lib/url";
import { clampPage } from "@/lib/paging";
import { Button } from "@/components/ui/button";
import { LeadPanel } from "@/components/lead-panel";
import { LeadTable } from "@/components/lead-table";
import { SearchBox } from "@/components/list-tools";
import { Pager } from "@/components/pager";
import { EmptyState, Page, PageHeader, Toolbar } from "@/components/page";

export const metadata = { title: "Removed leads" };

/** Admin only: leads removed from the list. They're out of every list, count and sequence until restored here. */
export default async function RemovedLeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const sort = (SORTS as readonly string[]).includes(first(sp.sort)) ? (first(sp.sort) as Sort) : "name";
  const dir = first(sp.dir) === "desc" ? "desc" : "asc";
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const size = pageSizeOf(first(sp.size));
  const q = first(sp.q).slice(0, 100);
  const leadId = Number(first(sp.lead)) || null;
  const params: Params = { q, sort: sort === "name" ? undefined : sort, dir: dir === "asc" ? undefined : dir, page: page > 1 ? String(page) : undefined, size: size === PAGE_SIZE ? undefined : String(size) };

  const [{ rows, total, today }, users, painPoints, lead] = await Promise.all([
    listLeads(admin, { view: "all", removed: true, q, owner: "", status: "", sort, dir, page, size }),
    listUsers(),
    listPainPoints(),
    leadId ? getLead(admin, leadId) : Promise.resolve(null),
  ]);
  clampPage(page, total, size, params, "/removed", { lead: leadId ? String(leadId) : undefined });
  const ids = rows.map((r) => r.id);
  const at = lead ? ids.indexOf(lead.id) : -1;
  const nextId = lead ? (at >= 0 ? ids[at + 1] : ids.find((id) => id !== lead.id)) : undefined;
  const people = users.map((u) => ({ id: u.id, name: u.name }));

  return (
    <Page>
      <PageHeader
        title="Removed leads"
        description="Leads taken off the list. They don't show in any list or count and their sequence is stopped; calls, comments and emails are kept. Restore one to put it back."
      />
      <Toolbar
        left={<SearchBox q={q} placeholder="Search removed leads…" />}
        right={<span className="text-sm text-muted-foreground tabular-nums">{total.toLocaleString("en-US")} removed {total === 1 ? "lead" : "leads"}</span>}
      />
      <LeadTable
        rows={rows}
        today={today}
        admin
        users={people}
        painPoints={painPoints}
        capacity={null}
        params={params}
        path="/removed"
        sort={sort}
        dir={dir}
        openId={lead?.id ?? null}
        variant="list"
        hideOwner
        removed
        empty={
          <EmptyState
            title={q ? "No removed leads match" : "No removed leads"}
            action={q ? <Button variant="outline" size="sm" asChild><Link href="/removed">Clear search</Link></Button> : undefined}
          >
            {q ? "Try a different search." : "Leads you remove from the Lead List or the Console show up here."}
          </EmptyState>
        }
      />
      <Pager page={page} total={total} size={size} params={params} path="/removed" noun={["lead", "leads"]} />

      {leadId && (lead ? (
        <LeadPanel
          key={lead.id}
          lead={lead}
          nextHref={nextId ? withParams(params, { lead: String(nextId) }, "/removed") : null}
          position={at >= 0 ? `Removed leads · ${((page - 1) * size + at + 1).toLocaleString("en-US")} of ${total.toLocaleString("en-US")}` : "Removed leads"}
          today={today}
          closeHref={withParams(params, {}, "/removed")}
          admin
          users={people}
          painPoints={painPoints}
          capacity={null}
        />
      ) : (
        <LeadPanel.Missing closeHref={withParams(params, {}, "/removed")} />
      ))}
    </Page>
  );
}
