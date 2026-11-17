import "server-only";
import type { User } from "./auth";
import { db } from "./db";
import { iso, todayISO } from "./dates";
import { merge } from "./sequence";
import { CALL_OUTCOMES } from "./schema";

/** Console views (working a queue) then Lead list views (finding leads). */
export const VIEWS = ["today", "due", "overdue", "new", "assigned", "unassigned", "all"] as const;
export type View = (typeof VIEWS)[number];
export const SORTS = ["due", "name", "company", "owner", "status"] as const;
export type Sort = (typeof SORTS)[number];
export const PAGE_SIZE = 100;

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
  ownerId: number | null;
  ownerName: string | null;
  status: string;
  disposition: string;
  nextKind: "step" | "callback" | null;
  nextLabel: string;
  nextChannel: string | null;
  nextDue: string | null;
};

// A lead on the "Email only" plan skips the Step 1 LinkedIn message, as in the old Console.
export const SKIPPED_STEP_SQL = `(s.step_number = 1 and s.channel = 'LinkedIn' and lp.channel_plan = 'Email only')`;

// The next thing owed on a lead: its first unsent step (only while Active), or a callback, whichever is due first.
const NEXT_ACTION_CTE = /* sql */ `
  next_step as (
    select distinct on (ls.lead_id) ls.lead_id, ls.due_on, s.step_number, s.channel
      from lead_steps ls
      join sequence_steps s on s.id = ls.step_id
      join leads lp on lp.id = ls.lead_id
     where ls.sent_at is null and not ${SKIPPED_STEP_SQL}
     order by ls.lead_id, s.position
  ),
  base as (
    select l.*, u.name as owner_name,
           case when l.status = 'Active' and l.disposition not in ('Meeting booked', 'Bounced', 'Requested to unsubscribe')
                then ns.due_on end as step_due,
           ns.step_number, ns.channel,
           case when l.status <> 'Bad' then l.callback_on end as cb_due
      from leads l
      left join users u on u.id = l.owner_id
      left join next_step ns on ns.lead_id = l.id
  ),
  enriched as (
    select *, least(step_due, cb_due) as next_due from base
  )`;

function visibility(user: User, params: unknown[]): string {
  if (user.role === "admin") return "true";
  params.push(user.id);
  return `(owner_id = $${params.length} or owner_id is null)`;
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
  view: View; q: string; owner: string; status: string; country?: string; zone?: string;
  sort: Sort; dir: "asc" | "desc"; page: number;
};

export async function listLeads(user: User, query: LeadQuery) {
  const d = await db();
  const today = todayISO();
  const params: unknown[] = [];
  const where = [visibility(user, params), viewClause(query.view, user, params, today)];
  if (query.q) {
    params.push(`%${query.q.toLowerCase()}%`);
    where.push(`lower(first_name || ' ' || last_name || ' ' || company || ' ' || email || ' ' || title) like $${params.length}`);
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
  const dir = query.dir === "desc" ? "desc" : "asc";
  const order = {
    due: `next_due ${dir} nulls last, last_name`,
    name: `last_name ${dir}, first_name ${dir}`,
    company: `company ${dir}, last_name`,
    owner: `owner_name ${dir} nulls ${dir === "asc" ? "first" : "last"}, last_name`,
    status: `status ${dir}, next_due nulls last`,
  }[query.sort];

  const sql = `with ${NEXT_ACTION_CTE}
    select *, count(*) over()::int as total from enriched
     where ${where.join(" and ")}
     order by ${order}
     limit ${PAGE_SIZE} offset ${(Math.max(1, query.page) - 1) * PAGE_SIZE}`;
  const rows = await d.query<Record<string, unknown>>(sql, params);
  return {
    total: rows.length ? Number(rows[0].total) : 0,
    rows: rows.map(toLeadRow),
    today,
  };
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
    ownerId: r.owner_id == null ? null : Number(r.owner_id),
    ownerName: (r.owner_name as string) ?? null,
    status: String(r.status),
    disposition: String(r.disposition),
    nextKind: callbackFirst ? "callback" : stepDue ? "step" : null,
    nextLabel: callbackFirst ? "Callback" : stepDue ? `Step ${r.step_number} · ${r.channel}` : "",
    nextChannel: callbackFirst ? "Phone" : stepDue ? String(r.channel) : null,
    nextDue,
  };
}

export type NavCounts = Record<View, number> & { interested: number; emailRequested: number };

/** Counts for each sidebar entry, under the same visibility rules as the lists. */
export async function viewCounts(user: User): Promise<NavCounts> {
  const d = await db();
  const today = todayISO();
  const params: unknown[] = [user.id, today];
  const vis = user.role === "admin" ? "true" : "(owner_id = $1 or owner_id is null)";
  const [row] = await d.query<Record<View, number>>(
    `with ${NEXT_ACTION_CTE}
     select count(*) filter (where owner_id = $1 and next_due <= $2)::int as today,
            count(*) filter (where owner_id is not null and next_due = $2)::int as due,
            count(*) filter (where owner_id is not null and next_due < $2)::int as overdue,
            count(*) filter (where owner_id is not null and activated_on = $2)::int as new,
            count(*) filter (where owner_id is not null)::int as assigned,
            count(*) filter (where owner_id is null)::int as unassigned,
            count(*)::int as "all"
       from enriched where ${vis}`,
    params,
  );
  const [follow] = await d.query<{ interested: number; email_requested: number }>(
    `with ${LAST_CALL_CTE}
     select count(*) filter (where c.outcome = 'Interested')::int as interested,
            count(*) filter (where c.outcome = 'Email requested')::int as email_requested
       from leads l join last_call c on c.lead_id = l.id
      where ${user.role === "admin" ? "true" : "(l.owner_id = $1 or l.owner_id is null)"}`,
    user.role === "admin" ? [] : [user.id],
  );
  return { ...row, interested: follow.interested, emailRequested: follow.email_requested };
}

/** Distinct countries and timezones on leads the user can see, for the list filters. */
export async function filterOptions(user: User) {
  const d = await db();
  const params: unknown[] = [];
  const vis = visibility(user, params);
  const [countries, zones] = await Promise.all([
    d.query<{ v: string }>(`select distinct country as v from leads where ${vis} and country <> '' order by 1`, params),
    d.query<{ v: string }>(`select distinct timezone as v from leads where ${vis} and timezone <> '' order by 1`, params),
  ]);
  return { countries: countries.map((r) => r.v), zones: zones.map((r) => r.v) };
}

/* ---------- calls: follow-ups and history ---------- */

// Each lead's most recent call.
const LAST_CALL_CTE = /* sql */ `
  last_call as (
    select distinct on (a.lead_id) a.lead_id, a.outcome, a.created_at, a.callback_on, a.body, a.user_id
      from activities a
     where a.kind = 'call'
     order by a.lead_id, a.created_at desc, a.id desc
  )`;

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
export async function listFollowups(user: User, kind: FollowupKind, q: string): Promise<FollowupRow[]> {
  const d = await db();
  const params: unknown[] = [FOLLOWUPS[kind].outcome];
  const where = ["c.outcome = $1", visibility(user, params).replaceAll("owner_id", "l.owner_id")];
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(`lower(l.first_name || ' ' || l.last_name || ' ' || l.company || ' ' || l.email || ' ' || c.body) like $${params.length}`);
  }
  const rows = await d.query<Record<string, unknown>>(
    `with ${LAST_CALL_CTE}
     select l.id, l.first_name, l.last_name, l.title, l.company, l.timezone, l.email, l.phone_work, l.phone_mobile, l.phone_corporate, l.phone_home, l.phone_other, l.phone_company, o.name as owner_name,
            c.created_at as call_at, cu.name as call_by, c.callback_on, c.body
       from leads l
       join last_call c on c.lead_id = l.id
       left join users o on o.id = l.owner_id
       left join users cu on cu.id = c.user_id
      where ${where.join(" and ")}
      order by c.created_at desc
      limit 500`,
    params,
  );
  return rows.map((r) => ({
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
  }));
}

export type CallRow = {
  id: number; leadId: number; leadName: string; company: string; ownerName: string | null;
  outcome: string; phone: string; notes: string; callbackOn: string | null; at: string; by: string;
};

export type CallQuery = { q: string; outcome: string; leadId: number | null; page: number };

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
  const rows = await d.query<Record<string, unknown>>(
    `select a.id, a.lead_id, a.outcome, a.phone, a.body, a.callback_on, a.created_at, u.name as by_name,
            l.first_name, l.last_name, l.company, o.name as owner_name, count(*) over()::int as total
       from activities a
       join leads l on l.id = a.lead_id
       left join users u on u.id = a.user_id
       left join users o on o.id = l.owner_id
      where ${where.join(" and ")}
      order by a.created_at desc, a.id desc
      limit ${PAGE_SIZE} offset ${(Math.max(1, query.page) - 1) * PAGE_SIZE}`,
    params,
  );
  return {
    total: rows.length ? Number(rows[0].total) : 0,
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

export async function listUsers() {
  const d = await db();
  return d.query<{ id: number; name: string; email: string; role: string }>("select id, name, email, role from users order by name");
}

export async function listPainPoints() {
  const d = await db();
  return (await d.query<{ label: string }>("select label from pain_points order by id")).map((r) => r.label);
}

export function canWrite(user: User, ownerId: number | null): boolean {
  return user.role === "admin" || (ownerId != null && ownerId === user.id);
}

export async function getLead(user: User, id: number) {
  const d = await db();
  const [lead] = await d.query<Record<string, unknown>>(
    `select l.*, u.name as owner_name from leads l left join users u on u.id = l.owner_id where l.id = $1`,
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
  const steps = (
    await d.query<Record<string, unknown>>(
      `select s.id, s.step_number, s.channel, s.subject, s.body, s.subject_titled, s.body_titled, s.day_offset, ls.due_on, ls.sent_at, su.name as sent_by
         from sequence_steps s
         left join lead_steps ls on ls.step_id = s.id and ls.lead_id = $1
         left join users su on su.id = ls.sent_by
        order by s.position`,
      [id],
    )
  ).map((s) => ({
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
  const activities = (
    await d.query<Record<string, unknown>>(
      `select a.*, u.name as user_name from activities a left join users u on u.id = a.user_id
        where a.lead_id = $1 order by a.created_at desc, a.id desc limit 100`,
      [id],
    )
  ).map((a) => ({
    id: Number(a.id),
    kind: String(a.kind),
    outcome: String(a.outcome ?? ""),
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
    steps,
    activities,
  };
}
export type LeadDetail = NonNullable<Awaited<ReturnType<typeof getLead>>>;

export async function dashboard(user: User) {
  const d = await db();
  const today = todayISO();
  // Same visibility as the lists: admins see everything, reps their own leads plus the unassigned pool.
  const scoped = user.role === "admin" ? "true" : `(l.owner_id = ${Number(user.id)} or l.owner_id is null)`;
  const owned = user.role === "admin" ? "l.owner_id is not null" : `l.owner_id = ${Number(user.id)}`;

  const [totals] = await d.query<Record<string, number>>(
    `with ${NEXT_ACTION_CTE}
     select count(*)::int as visible,
            count(*) filter (where l.owner_id is not null and l.status = 'Active')::int as active,
            count(*) filter (where l.next_due = $1 and l.owner_id is not null)::int as due_today,
            count(*) filter (where l.next_due < $1 and l.owner_id is not null)::int as overdue,
            count(*) filter (where l.owner_id is null)::int as unassigned,
            count(*) filter (where l.disposition = 'Meeting booked')::int as meetings
       from enriched l where ${scoped}`,
    [today],
  );
  const activityScope = user.role === "admin" ? "true" : `a.user_id = ${Number(user.id)}`;
  const tz = process.env.APP_TIMEZONE || "Asia/Singapore";
  const outcomes = await d.query<{ outcome: string; n: number }>(
    `select a.outcome, count(*)::int as n from activities a
      where a.kind = 'call' and (a.created_at at time zone $2)::date = $1::date and ${activityScope}
      group by a.outcome order by n desc`,
    [today, tz],
  );
  const reps = await d.query<Record<string, unknown>>(
    `with ${NEXT_ACTION_CTE}
     select u.id, u.name, u.role,
            (select count(*) from enriched e where e.owner_id = u.id and e.status = 'Active')::int as active,
            (select count(*) from enriched e where e.owner_id = u.id and e.next_due = $1)::int as due_today,
            (select count(*) from enriched e where e.owner_id = u.id and e.next_due < $1)::int as overdue,
            (select count(*) from activities a where a.user_id = u.id and a.kind = 'call' and (a.created_at at time zone $2)::date = $1::date)::int as calls_today,
            (select count(*) from activities a where a.user_id = u.id and a.kind = 'step' and (a.created_at at time zone $2)::date = $1::date)::int as steps_today,
            (select count(*) from leads l where l.owner_id = u.id and l.disposition = 'Meeting booked')::int as meetings
       from users u ${user.role === "admin" ? "" : `where u.id = ${Number(user.id)}`}
      order by u.name`,
    [today, tz],
  );
  // Due and overdue leads, oldest first: the old dashboard's queue.
  const queue = await d.query<Record<string, unknown>>(
    `with ${NEXT_ACTION_CTE}
     select *, count(*) over()::int as total from enriched l
      where ${owned} and l.next_due <= $1
      order by l.next_due, l.last_name limit 10`,
    [today],
  );
  const recent = await d.query<Record<string, unknown>>(
    `select a.id, a.kind, a.outcome, a.body, a.created_at, a.lead_id, u.name as user_name,
            l.first_name || ' ' || l.last_name as lead_name, l.company
       from activities a join leads l on l.id = a.lead_id left join users u on u.id = a.user_id
      where a.kind in ('call', 'step', 'note') and ${activityScope}
      order by a.created_at desc limit 7`,
  );
  return {
    today,
    totals,
    outcomes,
    callsToday: outcomes.reduce((n, o) => n + o.n, 0),
    queue: queue.map(toLeadRow),
    queueTotal: queue.length ? Number(queue[0].total) : 0,
    reps: reps.map((r) => ({
      id: Number(r.id), name: String(r.name), role: String(r.role), active: Number(r.active), dueToday: Number(r.due_today),
      overdue: Number(r.overdue), callsToday: Number(r.calls_today), stepsToday: Number(r.steps_today), meetings: Number(r.meetings),
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
export async function listDuplicateGroups(limit = 100): Promise<{ groups: DuplicateGroup[]; total: number }> {
  const d = await db();
  const keys = await d.query<{ reason: string; ids: number[] }>(
    `with k as (
       select id, 'Same name and company' as reason,
              regexp_replace(lower(first_name), '[^a-z0-9]', '', 'g') || '|' || regexp_replace(lower(last_name), '[^a-z0-9]', '', 'g')
              || '@' || regexp_replace(lower(company), '[^a-z0-9]', '', 'g') as key
         from leads where company <> '' and (first_name <> '' or last_name <> '')
       union all select id, 'Same LinkedIn profile', linkedin_key from leads where linkedin_key <> ''
       union all select id, 'Same contact ID', contact_id from leads where contact_id <> ''
       union all select l.id, 'Same phone number', right(regexp_replace(p, '[^0-9]', '', 'g'), 10)
         from leads l, unnest(array[l.phone_work, l.phone_mobile, l.phone_home]) as p
        where length(regexp_replace(p, '[^0-9]', '', 'g')) >= 7
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
  const roots = [...members.keys()];
  const shown = roots.slice(0, limit);
  const ids = shown.flatMap((r) => [...members.get(r)!]);
  if (!ids.length) return { groups: [], total: roots.length };

  const rows = await d.query<Record<string, unknown>>(
    `select l.id, l.first_name, l.last_name, l.title, l.company, l.email, l.email_status, l.status, l.created_at,
            coalesce(nullif(l.phone_mobile, ''), nullif(l.phone_work, ''), l.phone_home) as phone, u.name as owner_name,
            (select count(*) from activities a where a.lead_id = l.id and a.kind in ('call', 'note', 'step'))::int as activities
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
