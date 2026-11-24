import Link from "next/link";
import { CopyCheck, Gauge, Inbox, Upload, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { capacity, filterOptions, getLead, zoneOptions, cityOptions, duplicateCount, listLeads, listPainPoints, listUsers, PAGE_SIZE, pageSizeOf, SORTS, viewCounts, type Sort } from "@/lib/data";
import { LEAD_STATUSES } from "@/lib/schema";
import { first, withParams, type Params } from "@/lib/url";
import { clampPage } from "@/lib/paging";
import { Button } from "@/components/ui/button";
import { CapacityNote } from "@/components/capacity-note";
import { LeadPanel } from "@/components/lead-panel";
import { LeadTable } from "@/components/lead-table";
import { FilterSelect, SearchBox } from "@/components/list-tools";
import { Pager } from "@/components/pager";
import { EmptyState, Page, Segments, StatCard, StatGrid, Toolbar } from "@/components/page";

export const metadata = { title: "Lead List" };

/** The old Lead List tab: unassigned leads, filtered by status, country and timezone, assigned in batches. */
export default async function LeadListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const sort = (SORTS as readonly string[]).includes(first(sp.sort)) ? (first(sp.sort) as Sort) : "name";
  const dir = first(sp.dir) === "desc" ? "desc" : "asc";
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const size = pageSizeOf(first(sp.size));
  const q = first(sp.q).slice(0, 100);
  const status = (LEAD_STATUSES as readonly string[]).includes(first(sp.status)) ? first(sp.status) : "";
  const country = first(sp.country).slice(0, 100);
  const zone = first(sp.zone).slice(0, 100);
  const city = first(sp.city).slice(0, 100);
  const industry = first(sp.industry).slice(0, 100);
  const leadId = Number(first(sp.lead)) || null;
  const admin = user.role === "admin";

  const params: Params = { q, status, country, zone, city, industry, sort: sort === "name" ? undefined : sort, dir: dir === "asc" ? undefined : dir, page: page > 1 ? String(page) : undefined, size: size === PAGE_SIZE ? undefined : String(size) };

  const [{ rows, total, today }, users, painPoints, lead, options, cap, counts, dupes] = await Promise.all([
    listLeads(user, { view: "unassigned", q, owner: "", status, country, zone, city, industry, sort, dir, page, size }),
    listUsers(),
    admin ? listPainPoints() : Promise.resolve([] as string[]),
    leadId ? getLead(user, leadId) : Promise.resolve(null),
    filterOptions(user),
    capacity(),
    viewCounts(user),
    admin ? duplicateCount() : Promise.resolve(0),
  ]);
  clampPage(page, total, size, params, "/leads", { lead: leadId ? String(leadId) : undefined });
  const people = users.map((u) => ({ id: u.id, name: u.name }));
  const ids = rows.map((r) => r.id);
  const at = lead ? ids.indexOf(lead.id) : -1;
  const nextId = lead ? (at >= 0 ? ids[at + 1] : ids.find((id) => id !== lead.id)) : undefined;
  const filtered = Boolean(q || status || country || zone || city || industry);
  const zones = zoneOptions(options.zones, country);
  // Hundreds of cities per country, so the city list is offered only once a country narrows it.
  const cities = country ? cityOptions(options.cities, country, zone) : [];
  const startedToday = admin ? Object.values(cap.used).reduce((n, v) => n + v, 0) : cap.used[user.id] ?? 0;

  return (
    <Page>
      <Toolbar
        left={<SearchBox q={q} placeholder="Search unassigned leads…" />}
        right={
          <>
            {options.countries.length > 0 && (
              <FilterSelect name="country" label="Country" value={country} any="All countries" options={options.countries.map((c) => ({ value: c, label: c }))} clears={["zone", "city"]} />
            )}
            {zones.length > 0 && (
              <FilterSelect name="zone" label="Timezone" value={zone} any={country ? `All ${country} timezones` : "All timezones"} options={zones} clears={["city"]} />
            )}
            {(cities.length > 0 || city) && (
              <FilterSelect name="city" label="City" value={city} any="All cities" options={cities} />
            )}
            {options.industries.length > 0 && (
              <FilterSelect name="industry" label="Industry" value={industry} any="All industries" options={options.industries} />
            )}
            {admin && (
              <Button size="sm" className="h-8" asChild><Link href="/import"><Upload /> Upload leads</Link></Button>
            )}
          </>
        }
      />

      {dupes > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="inline-flex items-center gap-2"><CopyCheck className="size-4" /> {dupes} possible duplicate {dupes === 1 ? "group" : "groups"} in the CRM.</span>
          <Button variant="outline" size="sm" className="h-8 bg-background" asChild><Link href="/duplicates">Review duplicates</Link></Button>
        </div>
      )}

      <StatGrid>
        <StatCard icon={Inbox} tone="blue" title="Unassigned" value={counts.unassigned} note="Waiting for an owner" />
        <StatCard icon={Users} tone="amber" title="All leads" value={counts.all} note={admin ? "In the CRM" : "Yours plus the unassigned pool"} href="/?view=all" linkLabel="Open in Console" />
        <StatCard
          icon={Gauge}
          tone="rose"
          title="Started today"
          value={startedToday}
          note={cap.limits.email == null && cap.limits.linkedin == null ? "No daily limit set" : `Daily limit per owner: Email ${cap.limits.email ?? "none"} · LinkedIn ${cap.limits.linkedin ?? "none"}`}
          href={admin ? "/sequence" : undefined}
          linkLabel="Edit daily limits"
        />
      </StatGrid>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segments
            label="Lead status"
            items={[{ label: "All", value: "" }, ...LEAD_STATUSES.map((s) => ({ label: s, value: s }))].map(({ label, value }) => ({
              label, href: withParams({ q, country, zone, city, industry, size: params.size }, { status: value || undefined }, "/leads"), active: status === value,
            }))}
          />
          {!admin && <CapacityNote capacity={cap} ownerId={user.id} ownerName="You" className="text-xs" />}
        </div>
        <LeadTable
          rows={rows}
          today={today}
          admin={admin}
          users={people}
          painPoints={painPoints}
          capacity={cap}
          params={params}
          path="/leads"
          sort={sort}
          dir={dir}
          openId={lead?.id ?? null}
          hideOwner
          variant="list"
          empty={
            <EmptyState
              title={filtered ? "No leads match" : counts.all === 0 ? "No leads yet" : "No unassigned leads"}
              action={
                filtered ? <Button variant="outline" size="sm" asChild><Link href="/leads">Clear filters</Link></Button>
                : admin ? <Button size="sm" asChild><Link href="/import"><Upload /> Upload leads</Link></Button>
                : undefined
              }
            >
              {filtered
                ? "Try a different search or clear the filters."
                : counts.all === 0
                  ? admin ? "Upload your leads workbook (.xlsx) to bring your leads in." : "An admin uploads the leads; they'll show here."
                  : "Every lead has an owner. Upload more leads to fill the list."}
            </EmptyState>
          }
        />
      </div>
      <Pager page={page} total={total} size={size} params={params} path="/leads" noun={["lead", "leads"]} />

      {leadId && (lead ? (
        <LeadPanel
          key={lead.id}
          lead={lead}
          nextHref={nextId ? withParams(params, { lead: String(nextId) }, "/leads") : null}
          position={at >= 0 ? `Lead List · ${((page - 1) * size + at + 1).toLocaleString("en-US")} of ${total.toLocaleString("en-US")}` : "Lead List"}
          today={today}
          closeHref={withParams(params, {}, "/leads")}
          admin={admin}
          users={people}
          painPoints={painPoints}
          capacity={admin ? cap : null}
        />
      ) : (
        <LeadPanel.Missing closeHref={withParams(params, {}, "/leads")} />
      ))}
    </Page>
  );
}
