import "server-only";
import type { User } from "./auth";
import { db } from "./db";
import { addDays, dateTime, iso, todayISO } from "./dates";
import { industryLabel } from "./format";
import { merge } from "./sequence";
import { CALL_OUTCOMES } from "./schema";
import { brevoConfigured, senderProblem } from "./brevo";
import type { SignatureData } from "./signature";

/** Console views (working a queue) then Lead list views (finding leads). */
export const VIEWS = ["today", "due", "overdue", "new", "assigned", "unassigned", "all"] as const;
export type View = (typeof VIEWS)[number];
export const SORTS = ["due", "name", "company", "owner", "status"] as const;
export type Sort = (typeof SORTS)[number];
/** Rows per page: a choice of 25, 50 or 100 (?size=), 50 by default. */
export const PAGE_SIZES = [25, 50, 100] as const;
export const PAGE_SIZE = 50;
export function pageSizeOf(v: string): number {
  const n = Number(v);
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : PAGE_SIZE;
}

export type LeadRow = {
  id: number;
  name: string;
  title: string;
  company: string;
  email: string;
  emailStatus: string;
  phone: string;
  linkedin: string;
  country: string;
  timezone: string;
  industry: string;
  ownerId: number | null;
  ownerName: string | null;
  status: string;
  disposition: string;
  nextKind: "step" | "callback" | null;
  nextLabel: string;
  nextChannel: string | null;
  nextDue: string | null;
  /** When the lead was removed from the list, ready to show ("25 Nov, 14:32"). Removed leads list only. */
  removedAt: string | null;
};

// A lead on the "Email only" plan skips the Step 1 LinkedIn message, as in the old Console.
export const SKIPPED_STEP_SQL = `(s.step_number = 1 and s.channel = 'LinkedIn' and lp.channel_plan = 'Email only')`;

// The next thing owed on a lead is stored on the lead itself (lib/cache.ts keeps it current), so this is a plain
// join that Postgres inlines: filters and sorts hit the leads indexes instead of recomputing every lead.
const NEXT_ACTION_CTE = /* sql */ `
  enriched as (
    select l.*, u.name as owner_name, l.step_channel as channel,
           case when l.status <> 'Bad' then l.callback_on end as cb_due
      from leads l left join users u on u.id = l.owner_id
  )`;

/**
 * Which leads a user sees: admins everything, reps their own plus the unassigned pool. Leads removed from the list
 * are left out everywhere, except the Removed leads list (`removed` true), which shows only them.
 */
function visibility(user: User, params: unknown[], removed = false): string {
  const gone = removed ? "removed_at is not null" : "removed_at is null";
  if (user.role === "admin") return `(${gone})`;
  params.push(user.id);
  return `((owner_id = $${params.length} or owner_id is null) and ${gone})`;
}

function viewClause(view: View, user: User, params: unknown[], today: string): string {
  switch (view) {
    case "today":
      params.push(user.id, today);
      return `owner_id = $${params.length - 1} and next_due <= $${params.length}`;
    case "due":
      params.push(today);
      return `owner_id is not null and next_due = $${params.length}`;
    case "overdue":
      params.push(today);
      return `owner_id is not null and next_due < $${params.length}`;
    case "new":
      params.push(today);
      return `owner_id is not null and activated_on = $${params.length}`;
    case "assigned":
      return `owner_id is not null`;
    case "unassigned":
      return `owner_id is null`;
    default:
      return "true";
  }
}

export type LeadQuery = {
  view: View; q: string; owner: string; status: string; country?: string; zone?: string; city?: string; industry?: string;
  /** An upload batch id, or "none" for leads that didn't come from an upload. */
  batch?: string;
  /** The Removed leads list: only leads removed from the list. */
  removed?: boolean;
  sort: Sort; dir: "asc" | "desc"; page: number; size?: number;
};

export async function listLeads(user: User, query: LeadQuery) {
  const d = await db();
  const today = todayISO();
  const params: unknown[] = [];
  const where = [visibility(user, params, query.removed), viewClause(query.view, user, params, today)];
  // Search: find the matching leads through the trigram index first, then sort just those.
  let matched = "";
  if (query.q) {
    params.push(`%${query.q.toLowerCase()}%`);
    matched = `matched as materialized (
      select id from leads where lower(first_name || ' ' || last_name || ' ' || company || ' ' || email || ' ' || title) like $${params.length}
    )`;
    where.push("id in (select id from matched)");
  }
  if (query.owner && user.role === "admin") {
    if (query.owner === "none") where.push("owner_id is null");
    else {
      params.push(Number(query.owner));
      where.push(`owner_id = $${params.length}`);
    }
  }
  if (query.status) {
    params.push(query.status);
    where.push(`status = $${params.length}`);
  }
  if (query.country) {
    params.push(query.country);
    where.push(`country = $${params.length}`);
  }
  if (query.zone) {
    params.push(query.zone);
    where.push(`timezone = $${params.length}`);
  }
  if (query.city) {
    params.push(query.city);
    where.push(`city = $${params.length}`);
  }
  if (query.industry) {
    params.push(query.industry);
    where.push(`industry = $${params.length}`);
  }
  if (query.batch === "none") where.push("batch_id is null");
  else if (Number(query.batch)) {
    params.push(Number(query.batch));
    where.push(`batch_id = $${params.length}`);
  }
  const dir = query.dir === "desc" ? "desc" : "asc";
  const order = {
    due: `next_due ${dir} nulls last, last_name`,
    name: `last_name ${dir}, first_name ${dir}`,
    company: `company ${dir}, last_name`,
    owner: `owner_name ${dir} nulls ${dir === "asc" ? "first" : "last"}, last_name`,
    status: `status ${dir}, next_due nulls last`,
  }[query.sort];
  // The Removed leads list reads newest removal first unless a column is chosen.
  const orderBy = query.removed && query.sort === "name" && dir === "asc" ? "removed_at desc, last_name" : order;

  const size = query.size ?? PAGE_SIZE;
  const filter = where.join(" and ");
  // The page and the total run side by side; the page reads only its own rows through the indexes.
  const [rows, [count]] = await Promise.all([
    d.query<Record<string, unknown>>(
      `with ${matched ? `${matched}, ` : ""}${NEXT_ACTION_CTE} select * from enriched where ${filter} order by ${orderBy}
        limit ${size} offset ${(Math.max(1, query.page) - 1) * size}`,
      params,
    ),
    d.query<{ total: number }>(`${matched ? `with ${matched} ` : ""}select count(*)::int as total from leads where ${filter}`, params),
  ]);
  return { total: count.total, rows: rows.map(toLeadRow), today, size };
}

function toLeadRow(r: Record<string, unknown>): LeadRow {
  const stepDue = iso(r.step_due), cbDue = iso(r.cb_due), nextDue = iso(r.next_due);
  const callbackFirst = cbDue && (!stepDue || cbDue <= stepDue);
  return {
    id: Number(r.id),
    name: `${r.first_name} ${r.last_name}`.trim() || "(No name)",
    title: String(r.title ?? ""),
    company: String(r.company ?? ""),
    email: String(r.email ?? ""),
    emailStatus: String(r.email_status ?? ""),
    phone: String(r.phone_work || r.phone_mobile || r.phone_corporate || r.phone_home || r.phone_other || r.phone_company || ""),
    linkedin: String(r.linkedin_url ?? ""),
    country: String(r.country ?? ""),
    timezone: String(r.timezone ?? ""),
    industry: String(r.industry ?? ""),
    ownerId: r.owner_id == null ? null : Number(r.owner_id),
    ownerName: (r.owner_name as string) ?? null,
    status: String(r.status),
    disposition: String(r.disposition),
    nextKind: callbackFirst ? "callback" : stepDue ? "step" : null,
    nextLabel: callbackFirst ? "Callback" : stepDue ? `Step ${r.step_number} · ${r.channel}` : "",
    nextChannel: callbackFirst ? "Phone" : stepDue ? String(r.channel) : null,
    nextDue,
    // Formatted here, on the server, in the team's timezone (the table is a client component).
    removedAt: r.removed_at ? dateTime(r.removed_at) : null,
  };
}

export type NavCounts = Record<View, number> & { interested: number; emailRequested: number; removed: number };

/** Counts for each sidebar entry, under the same visibility rules as the lists. Removed leads count only as removed. */
export async function viewCounts(user: User): Promise<NavCounts> {
  const d = await db();
  const today = todayISO();
  const vis = user.role === "admin" ? "removed_at is null" : "(owner_id = $1 or owner_id is null) and removed_at is null";
  const removed = user.role === "admin" ? "(select count(*) from leads where removed_at is not null)::int" : "0";
  // One pass over leads: every count reads stored columns, including each lead's last call result.
  const [row] = await d.query<Record<string, number>>(
    `select count(*) filter (where owner_id = $1 and next_due <= $2)::int as today,
            count(*) filter (where owner_id is not null and next_due = $2)::int as due,
            count(*) filter (where owner_id is not null and next_due < $2)::int as overdue,
            count(*) filter (where owner_id is not null and activated_on = $2)::int as new,
            count(*) filter (where owner_id is not null)::int as assigned,
            count(*) filter (where owner_id is null)::int as unassigned,
            count(*)::int as "all",
            count(*) filter (where last_call_outcome = 'Interested')::int as interested,
            count(*) filter (where last_call_outcome = 'Email requested')::int as email_requested,
            ${removed} as removed
       from leads where ${vis}`,
    [user.id, today],
  );
  const { email_requested, ...rest } = row;
  return { ...(rest as Record<View, number> & { interested: number; removed: number }), emailRequested: email_requested };
}

/** Distinct countries, timezones and cities on leads the user can see, for the list filters. */
export async function filterOptions(user: User) {
  const d = await db();
  const params: unknown[] = [];
  const vis = visibility(user, params);
  const [countries, zones, cities, industries] = await Promise.all([
    d.query<{ v: string }>(`select distinct country as v from leads where ${vis} and country <> '' order by 1`, params),
    d.query<{ zone: string; country: string }>(`select distinct timezone as zone, country from leads where ${vis} and timezone <> ''`, params),
    d.query<{ city: string; zone: string; country: string }>(`select distinct city, timezone as zone, country from leads where ${vis} and city <> ''`, params),
    d.query<{ v: string }>(`select distinct industry as v from leads where ${vis} and industry <> '' order by 1`, params),
  ]);
  return {
    countries: countries.map((r) => r.v),
    industries: industries.map((r) => ({ value: r.v, label: industryLabel(r.v) })),
    zones: zones.map((r) => ({ zone: r.zone, country: r.country })),
    cities: cities.map((r) => ({ city: r.city, zone: r.zone, country: r.country })),
  };
}

/** City filter options within a country, narrowed to one timezone when one is chosen. */
export function cityOptions(cities: { city: string; zone: string; country: string }[], country: string, zone = "") {
  const inScope = cities.filter((c) => c.country === country && (!zone || c.zone === zone));
  return [...new Set(inScope.map((c) => c.city))].sort((a, b) => a.localeCompare(b)).map((c) => ({ value: c, label: c }));
}

/** "America/Indiana/Indianapolis" -> "Indianapolis": timezones read as their city. */
export function zoneCity(zone: string) {
  return (zone.split("/").pop() ?? zone).replaceAll("_", " ");
}

/** Timezone filter options, labelled by city and limited to the chosen country (all zones when none is chosen). */
export function zoneOptions(zones: { zone: string; country: string }[], country = "") {
  const inCountry = country ? zones.filter((z) => z.country === country) : zones;
  const unique = [...new Set(inCountry.map((z) => z.zone))];
  return unique.map((z) => ({ value: z, label: zoneCity(z) })).sort((a, b) => a.label.localeCompare(b.label));
}

/* ---------- calls: follow-ups and history ---------- */

export const FOLLOWUPS = {
  interested: { outcome: "Interested", label: "Interested Leads" },
  "email-requested": { outcome: "Email requested", label: "Email Requested" },
} as const;
export type FollowupKind = keyof typeof FOLLOWUPS;

export type FollowupRow = {
  id: number; name: string; title: string; company: string; timezone: string; ownerName: string | null;
  email: string; phone: string;
  callAt: string; callBy: string; callbackOn: string | null; notes: string;
};

/** Leads whose latest call ended with the given outcome, newest call first. */
export async function listFollowups(user: User, kind: FollowupKind, q: string, page = 1, size = PAGE_SIZE): Promise<{ rows: FollowupRow[]; total: number; callbacksDue: number; callbacksLater: number }> {
  const d = await db();
  const params: unknown[] = [FOLLOWUPS[kind].outcome];
  const where = ["l.last_call_outcome = $1", visibility(user, params).replaceAll("owner_id", "l.owner_id")];
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(`(lower(l.first_name || ' ' || l.last_name || ' ' || l.company || ' ' || l.email || ' ' || l.title) like $${params.length}
                 or lower(c.body) like $${params.length})`);
  }
  const filter = where.join(" and ");
  const [rows, [count]] = await Promise.all([
    d.query<Record<string, unknown>>(
      `select l.id, l.first_name, l.last_name, l.title, l.company, l.timezone, l.email, l.phone_work, l.phone_mobile, l.phone_corporate, l.phone_home, l.phone_other, l.phone_company, o.name as owner_name,
              c.created_at as call_at, cu.name as call_by, c.callback_on, c.body
         from leads l
         join activities c on c.id = l.last_call_id
         left join users o on o.id = l.owner_id
         left join users cu on cu.id = c.user_id
        where ${filter}
        order by l.last_call_at desc
        limit ${size} offset ${(Math.max(1, page) - 1) * size}`,
      params,
    ),
    d.query<{ total: number; due: number; later: number }>(
      `select count(*)::int as total,
              count(*) filter (where c.callback_on <= '${todayISO()}'::date)::int as due,
              count(*) filter (where c.callback_on > '${todayISO()}'::date)::int as later
         from leads l join activities c on c.id = l.last_call_id where ${filter}`,
      params,
    ),
  ]);
  return {
    total: count.total,
    callbacksDue: count.due,
    callbacksLater: count.later,
    rows: rows.map((r) => ({
      id: Number(r.id),
      name: `${r.first_name} ${r.last_name}`.trim() || "(No name)",
      title: String(r.title ?? ""),
      company: String(r.company ?? ""),
      timezone: String(r.timezone ?? ""),
      ownerName: (r.owner_name as string) ?? null,
      email: String(r.email ?? ""),
      phone: String(r.phone_work || r.phone_mobile || r.phone_corporate || r.phone_home || r.phone_other || r.phone_company || ""),
      callAt: new Date(String(r.call_at)).toISOString(),
      callBy: (r.call_by as string) ?? "System",
      callbackOn: iso(r.callback_on),
      notes: String(r.body ?? ""),
    })),
  };
}

export type CallRow = {
  id: number; leadId: number; leadName: string; company: string; ownerName: string | null;
  outcome: string; phone: string; notes: string; callbackOn: string | null; at: string; by: string;
};

export type CallQuery = { q: string; outcome: string; leadId: number | null; page: number; size?: number };

/** Every logged call on leads the user can see, newest first. */
export async function listCalls(user: User, query: CallQuery) {
  const d = await db();
  const params: unknown[] = [];
  const where = ["a.kind = 'call'", visibility(user, params).replaceAll("owner_id", "l.owner_id")];
  if (query.leadId) {
    params.push(query.leadId);
    where.push(`a.lead_id = $${params.length}`);
  }
  if (query.outcome) {
    params.push(query.outcome);
    where.push(`a.outcome = $${params.length}`);
  }
  if (query.q) {
    params.push(`%${query.q.toLowerCase()}%`);
    where.push(`lower(l.first_name || ' ' || l.last_name || ' ' || l.company || ' ' || a.phone || ' ' || a.outcome || ' ' || a.body || ' ' || coalesce(u.name, '')) like $${params.length}`);
  }
  const size = query.size ?? PAGE_SIZE;
  const filter = where.join(" and ");
  const [rows, [count]] = await Promise.all([
    d.query<Record<string, unknown>>(
      `select a.id, a.lead_id, a.outcome, a.phone, a.body, a.callback_on, a.created_at, u.name as by_name,
              l.first_name, l.last_name, l.company, o.name as owner_name
         from activities a
         join leads l on l.id = a.lead_id
         left join users u on u.id = a.user_id
         left join users o on o.id = l.owner_id
        where ${filter}
        order by a.created_at desc, a.id desc
        limit ${size} offset ${(Math.max(1, query.page) - 1) * size}`,
      params,
    ),
    d.query<{ total: number }>(
      `select count(*)::int as total from activities a join leads l on l.id = a.lead_id left join users u on u.id = a.user_id where ${filter}`,
      params,
    ),
  ]);
  return {
    total: count.total,
    rows: rows.map((r): CallRow => ({
      id: Number(r.id),
      leadId: Number(r.lead_id),
      leadName: `${r.first_name} ${r.last_name}`.trim() || "(No name)",
      company: String(r.company ?? ""),
      ownerName: (r.owner_name as string) ?? null,
      outcome: String(r.outcome ?? ""),
      phone: String(r.phone ?? ""),
      notes: String(r.body ?? ""),
      callbackOn: iso(r.callback_on),
      at: new Date(String(r.created_at)).toISOString(),
      by: (r.by_name as string) ?? "System",
    })),
  };
}

/** How many logged calls ended with each outcome, on leads the user can see. */
export async function callOutcomeCounts(user: User): Promise<Record<string, number>> {
  const d = await db();
  const params: unknown[] = [];
  const vis = visibility(user, params).replaceAll("owner_id", "l.owner_id");
  const rows = await d.query<{ outcome: string; n: number }>(
    `select a.outcome, count(*)::int as n from activities a join leads l on l.id = a.lead_id
      where a.kind = 'call' and ${vis} group by a.outcome`,
    params,
  );
  return Object.fromEntries(rows.map((r) => [r.outcome, Number(r.n)]));
}

/** The name of one lead, for the "calls for …" filter label. Respects visibility. */
export async function leadName(user: User, id: number): Promise<string | null> {
  const d = await db();
  const params: unknown[] = [id];
  const [row] = await d.query<{ first_name: string; last_name: string }>(
    `select first_name, last_name from leads where id = $1 and ${visibility(user, params)}`,
    params,
  );
  return row ? `${row.first_name} ${row.last_name}`.trim() || "(No name)" : null;
}

/* ---------- daily capacity ---------- */

export type DailyLimits = { email: number | null; linkedin: number | null };
/** Today's limits, and how many leads each owner has already started today (each start sends Step 1 by Email and LinkedIn). */
export type Capacity = { limits: DailyLimits; used: Record<number, number>; usedLinkedin: Record<number, number> };

export async function dailyLimits(): Promise<DailyLimits> {
  const d = await db();
  const rows = await d.query<{ key: string; value: string }>("select key, value from settings where key in ('daily_email_limit', 'daily_linkedin_limit')");
  const read = (k: string) => {
    const v = rows.find((r) => r.key === k)?.value ?? "";
    return v !== "" && Number.isInteger(Number(v)) && Number(v) >= 0 ? Number(v) : null;
  };
  return { email: read("daily_email_limit"), linkedin: read("daily_linkedin_limit") };
}

export async function capacity(): Promise<Capacity> {
  const d = await db();
  const [limits, rows] = await Promise.all([
    dailyLimits(),
    // Like the old Sheet: every lead started today counts for Email; only "Email + LinkedIn" leads count for LinkedIn.
    d.query<{ owner_id: number; n: number; li: number }>(
      `select owner_id, count(*)::int as n, count(*) filter (where channel_plan = 'Email + LinkedIn')::int as li
         from leads where owner_id is not null and status = 'Active' and activated_on = $1 group by owner_id`,
      [todayISO()],
    ),
  ]);
  return {
    limits,
    used: Object.fromEntries(rows.map((r) => [Number(r.owner_id), Number(r.n)])),
    usedLinkedin: Object.fromEntries(rows.map((r) => [Number(r.owner_id), Number(r.li)])),
  };
}

/* ---------- upload batches ---------- */

export type UploadBatch = { id: number; createdAt: string; fileName: string; uploadedBy: string; total: number; unassigned: number };

/**
 * Upload batches, newest first, with how many of each batch's leads are still unassigned (what the Lead List shows),
 * plus how many unassigned leads came from no upload at all (seeded or merged in). Same visibility as the lists.
 */
export async function listBatches(user: User): Promise<{ batches: UploadBatch[]; noBatch: number }> {
  const d = await db();
  const params: unknown[] = [];
  const vis = visibility(user, params);
  const [rows, [none]] = await Promise.all([
    d.query<Record<string, unknown>>(
      `select b.id, b.created_at, b.file_name, b.lead_count, u.name as uploaded_by,
              (select count(*) from leads l where l.batch_id = b.id and l.owner_id is null and ${vis})::int as unassigned
         from import_batches b left join users u on u.id = b.user_id
        order by b.created_at desc, b.id desc`,
      params,
    ),
    d.query<{ n: number }>(`select count(*)::int as n from leads where batch_id is null and owner_id is null and ${vis}`, params),
  ]);
  return {
    batches: rows.map((r) => ({
      id: Number(r.id), createdAt: new Date(String(r.created_at)).toISOString(), fileName: String(r.file_name),
      uploadedBy: String(r.uploaded_by ?? ""), total: Number(r.lead_count), unassigned: Number(r.unassigned),
    })),
    noBatch: none.n,
  };
}

/* ---------- activity log (admin) ---------- */

export type AuditRow = {
  id: number; createdAt: string; userId: number | null; userName: string; category: string; action: string;
  summary: string; leadId: number | null; leadName: string; detail: Record<string, unknown>;
};

export type AuditQuery = {
  /** First and last day (YYYY-MM-DD, team timezone), inclusive. */
  from: string; to: string;
  userId?: number | null; category?: string; q?: string;
  page: number; size: number;
};

/** The activity log for a date range, newest first, with per-category counts for the same filters. */
export async function listAuditLog(query: AuditQuery) {
  const d = await db();
  const tz = process.env.APP_TIMEZONE || "Asia/Singapore";
  const params: unknown[] = [query.from, query.to, tz];
  const where = ["a.created_at >= ($1::date::timestamp at time zone $3)", "a.created_at < (($2::date + 1)::timestamp at time zone $3)"];
  if (query.userId) { params.push(query.userId); where.push(`a.user_id = $${params.length}`); }
  if (query.q) {
    params.push(`%${query.q.toLowerCase()}%`);
    const p = `$${params.length}`;
    where.push(`(lower(a.summary) like ${p} or lower(a.lead_name) like ${p} or lower(a.user_name) like ${p} or lower(a.detail::text) like ${p})`);
  }
  const base = where.join(" and ");
  const catParams = [...params];
  let filter = base;
  if (query.category) { params.push(query.category); filter += ` and a.category = $${params.length}`; }
  const size = Math.min(200, Math.max(10, query.size));
  const offset = (Math.max(1, query.page) - 1) * size;

  const [rows, [count], byCategory] = await Promise.all([
    d.query<Record<string, unknown>>(
      `select a.id, a.created_at, a.user_id, coalesce(u.name, nullif(a.user_name, ''), 'System') as user_name, a.category, a.action,
              a.summary, a.lead_id, a.lead_name, a.detail
         from audit_log a left join users u on u.id = a.user_id
        where ${filter} order by a.created_at desc, a.id desc limit ${size} offset ${offset}`,
      params,
    ),
    d.query<{ total: number; people: number }>(`select count(*)::int as total, count(distinct a.user_id)::int as people from audit_log a where ${filter}`, params),
    d.query<{ category: string; n: number }>(`select a.category, count(*)::int as n from audit_log a where ${base} group by 1`, catParams),
  ]);
  return {
    rows: rows.map((r): AuditRow => ({
      id: Number(r.id), createdAt: new Date(String(r.created_at)).toISOString(), userId: r.user_id == null ? null : Number(r.user_id),
      userName: String(r.user_name), category: String(r.category), action: String(r.action), summary: String(r.summary),
      leadId: r.lead_id == null ? null : Number(r.lead_id), leadName: String(r.lead_name ?? ""),
      detail: (typeof r.detail === "string" ? JSON.parse(r.detail) : r.detail ?? {}) as Record<string, unknown>,
    })),
    total: count.total,
    people: count.people,
    byCategory: Object.fromEntries(byCategory.map((c) => [c.category, c.n])) as Record<string, number>,
  };
}

/** Everyone who has ever had an account, for the log's person filter (pending invites included). */
export async function listAllPeople() {
  const d = await db();
  return d.query<{ id: number; name: string; role: string }>("select id, name, role from users order by lower(name)");
}

export async function listUsers() {
  const d = await db();
  // People still on an invite can't be given leads until they've set a password.
  return d.query<{ id: number; name: string; email: string; role: string }>("select id, name, email, role from users where password_hash <> '' order by name");
}

export async function listPainPoints() {
  const d = await db();
  return (await d.query<{ label: string }>("select label from pain_points order by id")).map((r) => r.label);
}

/* ---------- team ---------- */

export type TeamMember = {
  id: number; name: string; email: string; role: "admin" | "rep"; status: "active" | "invited";
  invitedAt: string | null; inviteExpired: boolean; leads: number;
};

/** Everyone with an account or a pending invite, admins first, then by name. */
export async function listTeam(): Promise<TeamMember[]> {
  const d = await db();
  const rows = await d.query<Record<string, unknown>>(
    `select u.id, u.name, u.email, u.role, u.password_hash = '' as invited, u.invited_at,
            not exists (select 1 from auth_tokens t where t.user_id = u.id and t.purpose = 'invite' and t.used_at is null and t.expires_at > now()) as expired,
            (select count(*) from leads l where l.owner_id = u.id and l.removed_at is null)::int as leads
       from users u
      order by (u.password_hash = ''), u.role, lower(u.name)`,
  );
  return rows.map((r) => ({
    id: Number(r.id), name: String(r.name), email: String(r.email), role: r.role === "admin" ? "admin" : "rep",
    status: r.invited ? "invited" : "active",
    invitedAt: r.invited_at ? new Date(String(r.invited_at)).toISOString() : null,
    inviteExpired: Boolean(r.invited && r.expired),
    leads: Number(r.leads),
  }));
}

/* ---------- email signature ---------- */

export const COMPANY_DEFAULTS = { company_name: "DealWorkx", company_website: "dealworkx.com", company_address: "" } as const;

/** Company details for every signature (admin-editable settings), with defaults until they're saved. */
export async function companyDetails(): Promise<{ company: string; website: string; address: string }> {
  const d = await db();
  const rows = await d.query<{ key: string; value: string }>("select key, value from settings where key = any($1::text[])", [Object.keys(COMPANY_DEFAULTS)]);
  const get = (k: keyof typeof COMPANY_DEFAULTS) => rows.find((r) => r.key === k)?.value ?? COMPANY_DEFAULTS[k];
  return { company: get("company_name"), website: get("company_website"), address: get("company_address") };
}

/** One user's signature: their name, title, phone and email, plus the company details. */
export async function signatureFor(userId: number): Promise<SignatureData> {
  const d = await db();
  const [[u], company] = await Promise.all([
    d.query<{ name: string; email: string; title: string; phone: string }>("select name, email, title, phone from users where id = $1", [userId]),
    companyDetails(),
  ]);
  return { name: u?.name ?? "", email: u?.email ?? "", title: u?.title ?? "", phone: u?.phone ?? "", ...company };
}

export function canWrite(user: User, ownerId: number | null): boolean {
  return user.role === "admin" || (ownerId != null && ownerId === user.id);
}

export async function getLead(user: User, id: number) {
  const d = await db();
  const [lead] = await d.query<Record<string, unknown>>(
    `select l.*, u.name as owner_name, rb.name as removed_by_name
       from leads l left join users u on u.id = l.owner_id left join users rb on rb.id = l.removed_by where l.id = $1`,
    [id],
  );
  if (!lead) return null;
  const ownerId = lead.owner_id == null ? null : Number(lead.owner_id);
  if (user.role !== "admin" && ownerId !== null && ownerId !== user.id) return null;

  const sender = ownerId ? String(lead.owner_name) : user.name;
  const channelPlan = String(lead.channel_plan || "Email + LinkedIn");
  const fields = {
    first_name: String(lead.first_name), last_name: String(lead.last_name), company: String(lead.company),
    title: String(lead.title), pain_point: String(lead.pain_point), sender,
  };
  // Steps and activity are independent: fetch them side by side (each round trip to the database costs ~50 ms).
  const [stepRows, activityRows, signature] = await Promise.all([
    d.query<Record<string, unknown>>(
      `select s.id, s.step_number, s.channel, s.subject, s.body, s.subject_titled, s.body_titled, s.day_offset, ls.due_on, ls.sent_at, su.name as sent_by
         from sequence_steps s
         left join lead_steps ls on ls.step_id = s.id and ls.lead_id = $1
         left join users su on su.id = ls.sent_by
        order by s.position`,
      [id],
    ),
    d.query<Record<string, unknown>>(
      `select a.*, u.name as user_name from activities a left join users u on u.id = a.user_id
        where a.lead_id = $1 order by a.created_at desc, a.id desc limit 100`,
      [id],
    ),
    brevoConfigured() ? signatureFor(user.id) : Promise.resolve(null),
  ]);
  const steps = stepRows.map((s) => ({
    id: Number(s.id),
    stepNumber: Number(s.step_number),
    channel: String(s.channel) as "Email" | "LinkedIn",
    subject: merge(String(s.subject), fields),
    body: merge(String(s.body), fields),
    // Job-title aligned version; blank falls back to the general message.
    subjectTitled: merge(String(s.subject_titled || s.subject), fields),
    bodyTitled: merge(String(s.body_titled || s.body), fields),
    hasTitled: Boolean(String(s.body_titled ?? "").trim()),
    skipped: Number(s.step_number) === 1 && String(s.channel) === "LinkedIn" && channelPlan === "Email only",
    dueOn: iso(s.due_on),
    sentAt: s.sent_at ? new Date(String(s.sent_at)).toISOString() : null,
    sentBy: (s.sent_by as string) ?? null,
  }));
  const activities = activityRows.map((a) => ({
    id: Number(a.id),
    kind: String(a.kind),
    outcome: String(a.outcome ?? ""),
    subject: String(a.subject ?? ""),
    phone: String(a.phone ?? ""),
    body: String(a.body ?? ""),
    callbackOn: iso(a.callback_on),
    createdAt: new Date(String(a.created_at)).toISOString(),
    userName: (a.user_name as string) ?? "System",
  }));

  // The six phone types of the old PROSPECT LIST, in its order.
  const phones = [
    ["Work phone", lead.phone_work],
    ["Home phone", lead.phone_home],
    ["Mobile phone", lead.phone_mobile],
    ["Corporate phone", lead.phone_corporate],
    ["Other phone", lead.phone_other],
    ["Company phone", lead.phone_company],
  ]
    .filter(([, n]) => String(n ?? "").trim())
    .map(([label, number]) => ({ label: String(label), number: String(number) }));

  return {
    id: Number(lead.id),
    /** Set when the lead was removed from the list: when and by whom. */
    removed: lead.removed_at ? { at: new Date(String(lead.removed_at)).toISOString(), by: (lead.removed_by_name as string) ?? null } : null,
    firstName: String(lead.first_name),
    lastName: String(lead.last_name),
    name: `${lead.first_name} ${lead.last_name}`.trim() || "(No name)",
    title: String(lead.title),
    company: String(lead.company),
    email: String(lead.email),
    emailStatus: String(lead.email_status),
    phones,
    linkedin: String(lead.linkedin_url),
    companyLinkedin: String(lead.company_linkedin_url ?? ""),
    website: String(lead.website),
    city: String(lead.city ?? ""),
    seniority: String(lead.seniority ?? ""),
    departments: String(lead.departments ?? ""),
    channelPlan,
    sourceFields: (Array.isArray(lead.source_fields) ? lead.source_fields : []) as [string, string][],
    industry: String(lead.industry),
    employees: String(lead.employees),
    country: String(lead.country),
    state: String(lead.state),
    timezone: String(lead.timezone),
    ownerId,
    ownerName: (lead.owner_name as string) ?? null,
    status: String(lead.status),
    disposition: String(lead.disposition),
    painPoint: String(lead.pain_point),
    activatedOn: iso(lead.activated_on),
    callbackOn: iso(lead.callback_on),
    canWrite: canWrite(user, ownerId),
    /** Sending from the CRM (Brevo): who it goes out as, or why this user can't send. Hidden when Brevo isn't set up. */
    mail: signature ? { from: { name: user.name, email: user.email }, problem: senderProblem(user.email), signature } : null,
    steps,
    activities,
  };
}
export type LeadDetail = NonNullable<Awaited<ReturnType<typeof getLead>>>;

export const DASHBOARD_PERIODS = { day: 1, "7d": 7, "30d": 30 } as const;
export type DashboardPeriod = keyof typeof DASHBOARD_PERIODS;
export type DashboardQuery = {
  /** The day the dashboard reads as (YYYY-MM-DD); defaults to today. */
  date?: string;
  /** How many days, ending on `date`, the activity numbers cover. */
  period?: DashboardPeriod;
  /** Admins only: narrow everything to one owner. */
  owner?: number | null;
  country?: string;
  industry?: string;
  queuePage?: number;
};

export async function dashboard(user: User, query: DashboardQuery = {}) {
  const d = await db();
  const today = todayISO();
  const date = query.date || today;
  const days = DASHBOARD_PERIODS[query.period ?? "day"];
  const from = addDays(date, -(days - 1));
  const tz = process.env.APP_TIMEZONE || "Asia/Singapore";
  const admin = user.role === "admin";
  const owner = admin && query.owner ? Number(query.owner) : null;
  const queuePage = Math.max(1, query.queuePage ?? 1);

  // $1 from, $2 to, $3 timezone, $4 today in every query, then the optional lead filters.
  const base = (): unknown[] => [from, date, tz, today];
  // The period as a time range, so the activity and step indexes can be used.
  const rangeStart = `($1::date::timestamp at time zone $3)`, rangeEnd = `(($2::date + 1)::timestamp at time zone $3)`;
  /** Country / industry conditions on a leads alias, pushing their values onto `p`. */
  const leadFilter = (p: unknown[], alias = "l") => {
    const w: string[] = [];
    if (query.country) { p.push(query.country); w.push(`${alias}.country = $${p.length}`); }
    if (query.industry) { p.push(query.industry); w.push(`${alias}.industry = $${p.length}`); }
    return w.length ? ` and ${w.join(" and ")}` : "";
  };
  const narrowed = Boolean(query.country || query.industry);
  // Same visibility as the lists: admins see everything, reps their own leads plus the unassigned pool.
  const scoped = admin ? (owner ? `l.owner_id = ${owner}` : "true") : `(l.owner_id = ${Number(user.id)} or l.owner_id is null)`;
  // Leads removed from the list are out of every lead count and the queue (their past calls and steps still count).
  const pool = `l.removed_at is null and ${admin ? "true" : `(l.owner_id = ${Number(user.id)} or l.owner_id is null)`}`;
  const owned = `l.removed_at is null and ${admin ? (owner ? `l.owner_id = ${owner}` : "l.owner_id is not null") : `l.owner_id = ${Number(user.id)}`}`;
  const activityScope = admin ? (owner ? `a.user_id = ${owner}` : "true") : `a.user_id = ${Number(user.id)}`;
  const queueSize = 10;

  const p = { totals: base(), outcomes: base(), reps: base(), queue: base(), count: base(), recent: base() };
  const f = {
    totals: leadFilter(p.totals),
    outcomes: leadFilter(p.outcomes),
    reps: leadFilter(p.reps, "x"),
    queue: leadFilter(p.queue),
    count: leadFilter(p.count),
    recent: leadFilter(p.recent),
  };

  const [[totals], outcomes, reps, queue, [queueCount], recent] = await Promise.all([
    d.query<Record<string, number>>(
      `select count(*) filter (where ${scoped})::int as visible,
              count(*) filter (where ${scoped} and l.owner_id is not null and l.status = 'Active')::int as active,
              count(*) filter (where ${scoped} and l.owner_id is not null and l.next_due between $1 and $2)::int as due,
              count(*) filter (where ${scoped} and l.owner_id is not null and l.next_due < $4)::int as overdue,
              count(*) filter (where l.owner_id is null)::int as unassigned,
              count(*) filter (where ${scoped} and l.disposition = 'Meeting booked')::int as meetings
         from leads l where ${pool} and $3::text is not null${f.totals}`,
      p.totals,
    ),
    d.query<{ outcome: string; n: number }>(
      `select a.outcome, count(*)::int as n from activities a ${narrowed ? "join leads l on l.id = a.lead_id" : ""}
        where a.kind = 'call' and a.created_at >= ${rangeStart} and a.created_at < ${rangeEnd} and ${activityScope} and $4::date is not null${f.outcomes}
        group by a.outcome order by n desc`,
      p.outcomes,
    ),
    d.query<Record<string, unknown>>(
      `with owned as (
         select x.owner_id, count(*) filter (where x.status = 'Active')::int as active,
                count(*) filter (where x.next_due between $1 and $2)::int as due, count(*) filter (where x.next_due < $4)::int as overdue,
                count(*) filter (where x.disposition = 'Meeting booked')::int as meetings
           from leads x where x.owner_id is not null and x.removed_at is null${f.reps} group by x.owner_id
       ), calls as (
         select a.user_id, count(*)::int as n from activities a ${narrowed ? "join leads x on x.id = a.lead_id" : ""}
          where a.kind = 'call' and a.created_at >= ${rangeStart} and a.created_at < ${rangeEnd}${f.reps} group by a.user_id
       ), steps as (
         select s.sent_by, count(*)::int as n from lead_steps s ${narrowed ? "join leads x on x.id = s.lead_id" : ""}
          where s.sent_at >= ${rangeStart} and s.sent_at < ${rangeEnd}${f.reps} group by s.sent_by
       )
       select u.id, u.name, u.role, coalesce(o.active, 0) as active, coalesce(o.due, 0) as due, coalesce(o.overdue, 0) as overdue,
              coalesce(o.meetings, 0) as meetings, coalesce(c.n, 0) as calls, coalesce(s.n, 0) as steps
         from users u
         left join owned o on o.owner_id = u.id
         left join calls c on c.user_id = u.id
         left join steps s on s.sent_by = u.id
        where u.password_hash <> '' ${admin ? (owner ? `and u.id = ${owner}` : "") : `and u.id = ${Number(user.id)}`}
        order by u.name`,
      p.reps,
    ),
    // Due and overdue leads as of the chosen date, oldest first: the old dashboard's queue, paged.
    d.query<Record<string, unknown>>(
      `with ${NEXT_ACTION_CTE}
       select * from enriched l where ${owned} and l.next_due <= $2 and $1::date is not null and $3::text is not null and $4::date is not null${f.queue}
        order by l.next_due, l.last_name limit ${queueSize} offset ${(queuePage - 1) * queueSize}`,
      p.queue,
    ),
    d.query<{ total: number }>(
      `select count(*)::int as total from leads l
        where ${owned} and l.next_due <= $2 and $1::date is not null and $3::text is not null and $4::date is not null${f.count}`,
      p.count,
    ),
    d.query<Record<string, unknown>>(
      `select a.id, a.kind, a.outcome, a.body, a.created_at, a.lead_id, u.name as user_name,
              l.first_name || ' ' || l.last_name as lead_name, l.company
         from activities a join leads l on l.id = a.lead_id left join users u on u.id = a.user_id
        where a.kind in ('call', 'step', 'note', 'email') and ${activityScope}
          and a.created_at >= ${rangeStart} and a.created_at < ${rangeEnd} and $4::date is not null${f.recent}
        order by a.created_at desc limit 7`,
      p.recent,
    ),
  ]);
  return {
    today,
    date,
    from,
    days,
    totals,
    outcomes,
    calls: outcomes.reduce((n, o) => n + o.n, 0),
    queue: queue.map(toLeadRow),
    queueTotal: queueCount.total,
    queueSize,
    reps: reps.map((r) => ({
      id: Number(r.id), name: String(r.name), role: String(r.role), active: Number(r.active), due: Number(r.due),
      overdue: Number(r.overdue), calls: Number(r.calls), steps: Number(r.steps), meetings: Number(r.meetings),
    })),
    recent: recent.map((r) => ({
      id: Number(r.id), kind: String(r.kind), outcome: String(r.outcome ?? ""), body: String(r.body ?? ""),
      createdAt: new Date(String(r.created_at)).toISOString(), leadId: Number(r.lead_id),
      userName: (r.user_name as string) ?? "System", leadName: String(r.lead_name), company: String(r.company),
    })),
  };
}

export async function listSteps() {
  const d = await db();
  return d.query<{ id: number; position: number; step_number: number; channel: string; day_offset: number; subject: string; body: string; subject_titled: string; body_titled: string }>(
    "select * from sequence_steps order by position",
  );
}

/** Call outcomes, editable by admins (the old SETTINGS K5:K14). */
export async function listCallOutcomes(): Promise<string[]> {
  const d = await db();
  const [row] = await d.query<{ value: string }>("select value from settings where key = 'call_outcomes'");
  const list = (row?.value ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return list.length ? list : [...CALL_OUTCOMES];
}

/* ---------- duplicates already in the CRM ---------- */

export type DuplicateLead = {
  id: number; name: string; title: string; company: string; email: string; emailStatus: string; phone: string;
  ownerName: string | null; status: string; createdAt: string; activities: number;
};
export type DuplicateGroup = { reasons: string[]; leads: DuplicateLead[] };

/**
 * Leads that look like the same person: same name + company, same personal phone, same LinkedIn or contact ID.
 * Overlapping matches join into one group; pairs an admin marked "not duplicates" are left out.
 */
export async function listDuplicateGroups(limit = 20, offset = 0): Promise<{ groups: DuplicateGroup[]; total: number }> {
  const d = await db();
  const keys = await d.query<{ reason: string; ids: number[] }>(
    `with k as (
       select id, 'Same name and company' as reason,
              regexp_replace(lower(first_name), '[^a-z0-9]', '', 'g') || '|' || regexp_replace(lower(last_name), '[^a-z0-9]', '', 'g')
              || '@' || regexp_replace(lower(company), '[^a-z0-9]', '', 'g') as key
         from leads where company <> '' and (first_name <> '' or last_name <> '') and removed_at is null
       union all select id, 'Same LinkedIn profile', linkedin_key from leads where linkedin_key <> '' and removed_at is null
       union all select id, 'Same contact ID', contact_id from leads where contact_id <> '' and removed_at is null
       union all select l.id, 'Same phone number', right(regexp_replace(p, '[^0-9]', '', 'g'), 10)
         from leads l, unnest(array[l.phone_work, l.phone_mobile, l.phone_home]) as p
        where length(regexp_replace(p, '[^0-9]', '', 'g')) >= 7 and l.removed_at is null
     )
     select reason, array_agg(distinct id order by id) as ids from k group by reason, key having count(distinct id) > 1`,
  );
  const dismissed = new Set((await d.query<{ a: number; b: number }>("select lead_a as a, lead_b as b from duplicate_dismissals")).map((r) => `${r.a}-${r.b}`));

  // Union-find over the matching pairs.
  const parent = new Map<number, number>();
  const find = (x: number): number => { const p = parent.get(x) ?? x; if (p === x) return x; const r = find(p); parent.set(x, r); return r; };
  const reasonsByRoot = new Map<number, Set<string>>();
  const edges: [number, number, string][] = [];
  for (const k of keys) {
    const ids = k.ids.map(Number);
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const [a, b] = ids[i] < ids[j] ? [ids[i], ids[j]] : [ids[j], ids[i]];
        if (!dismissed.has(`${a}-${b}`)) edges.push([a, b, k.reason]);
      }
  }
  for (const [a, b] of edges) { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); }
  const members = new Map<number, Set<number>>();
  for (const [a, b, reason] of edges) {
    const r = find(a);
    if (!members.has(r)) members.set(r, new Set());
    members.get(r)!.add(a).add(b);
    if (!reasonsByRoot.has(r)) reasonsByRoot.set(r, new Set());
    reasonsByRoot.get(r)!.add(reason);
  }
  const roots = [...members.keys()].sort((a, b) => a - b);
  // Remember the count for the Lead List banner (reading a setting is free; this query is not).
  await d.query("insert into settings (key, value) values ('duplicate_groups', $1) on conflict (key) do update set value = excluded.value", [String(roots.length)]);
  const shown = roots.slice(offset, offset + limit);
  const ids = shown.flatMap((r) => [...members.get(r)!]);
  if (!ids.length) return { groups: [], total: roots.length };

  const rows = await d.query<Record<string, unknown>>(
    `select l.id, l.first_name, l.last_name, l.title, l.company, l.email, l.email_status, l.status, l.created_at,
            coalesce(nullif(l.phone_mobile, ''), nullif(l.phone_work, ''), l.phone_home) as phone, u.name as owner_name,
            (select count(*) from activities a where a.lead_id = l.id and a.kind in ('call', 'note', 'step', 'email'))::int as activities
       from leads l left join users u on u.id = l.owner_id where l.id = any($1::int[])`,
    [ids],
  );
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  return {
    total: roots.length,
    groups: shown.map((r) => ({
      reasons: [...reasonsByRoot.get(r)!],
      leads: [...members.get(r)!].sort((a, b) => a - b).map((id) => {
        const x = byId.get(id)!;
        return {
          id, name: `${x.first_name} ${x.last_name}`.trim() || "(No name)", title: String(x.title ?? ""), company: String(x.company ?? ""),
          email: String(x.email ?? ""), emailStatus: String(x.email_status ?? ""), phone: String(x.phone ?? ""),
          ownerName: (x.owner_name as string) ?? null, status: String(x.status), createdAt: new Date(String(x.created_at)).toISOString(),
          activities: Number(x.activities),
        };
      }),
    })),
  };
}

/** The duplicate-group count as of the last check (Duplicates page, uploads, merges). */
export async function duplicateCount(): Promise<number> {
  const d = await db();
  const [row] = await d.query<{ value: string }>("select value from settings where key = 'duplicate_groups'");
  return Number(row?.value ?? 0) || 0;
}
