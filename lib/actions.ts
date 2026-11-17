"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { createSession, destroySession, requireAdmin, requireUser, type User } from "./auth";
import { checkHeader, LEAD_COLUMNS, mapRow, type ImportedLead } from "./csv";
import { db, type Db } from "./db";
import { canWrite, listCallOutcomes } from "./data";
import { isValidISODate, isValidTimeZone, todayISO } from "./dates";
import { verifyPassword } from "./password";
import { CHANNEL_PLANS, DISPOSITIONS, LEAD_STATUSES, REQUIRED_OUTCOMES } from "./schema";
import { guessTimezone } from "./timezones";
import { readWorkbook, type Sheet } from "./workbook";
import { DuplicateIndex, emailCheck, linkedinKey, type Candidate, type Match } from "./dedupe";
import { scheduleSteps } from "./sequence";

export type FormState = { ok?: string; error?: string } | null;

function str(form: FormData, key: string, max = 4000): string {
  return String(form.get(key) ?? "").trim().slice(0, max);
}

async function writableLead(tx: Db, user: User, leadId: number) {
  const [lead] = await tx.query<{ id: number; owner_id: number | null; status: string; activated_on: unknown }>(
    "select id, owner_id, status, activated_on from leads where id = $1 for update",
    [leadId],
  );
  if (!lead || !canWrite(user, lead.owner_id == null ? null : Number(lead.owner_id))) {
    throw new Error("This lead isn't yours to change. Refresh the list.");
  }
  return lead;
}

function done(message: string): FormState {
  revalidatePath("/", "layout");
  return { ok: message };
}

function failed(error: unknown): FormState {
  unstable_rethrow(error);
  return { error: error instanceof Error ? error.message : "Something went wrong. Nothing was saved." };
}

/* ---------- session ---------- */

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const email = str(form, "email", 200).toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  const d = await db();
  const [user] = await d.query<{ id: number; password_hash: string }>("select id, password_hash from users where lower(email) = $1", [email]);
  if (!user || !(await verifyPassword(password, user.password_hash))) return { error: "That email and password don't match an account." };
  await createSession(user.id);
  redirect("/");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}

/* ---------- assignment (admin) ---------- */

export async function assignLeads(_: FormState, form: FormData): Promise<FormState> {
  try {
    const admin = await requireAdmin();
    const ids = [...new Set(form.getAll("ids").map(Number).filter(Number.isInteger))];
    const ownerId = Number(form.get("ownerId"));
    const painPoint = str(form, "painPoint", 300);
    if (!ids.length || ids.length > 200) return { error: "Select between 1 and 200 leads." };
    const d = await db();
    const [owner] = await d.query<{ id: number; name: string }>("select id, name from users where id = $1", [ownerId]);
    if (!owner) return { error: "Choose who the leads go to." };
    const known = (await d.query<{ label: string }>("select label from pain_points")).map((p) => p.label);
    if (!known.includes(painPoint)) return { error: "Choose the Step 1 pain point." };
    const today = todayISO();
    await d.transaction(async (tx) => {
      for (const id of ids) {
        const [lead] = await tx.query<{ id: number; activated_on: unknown }>("select id, activated_on from leads where id = $1 for update", [id]);
        if (!lead) throw new Error("A selected lead no longer exists. Nothing was assigned.");
        const activated = lead.activated_on ? null : today;
        await tx.query(
          `update leads set owner_id = $2, pain_point = $3, status = 'Active', channel_plan = 'Email + LinkedIn',
                  activated_on = coalesce(activated_on, $4::date), updated_at = now() where id = $1`,
          [id, ownerId, painPoint, today],
        );
        await scheduleSteps(tx, id, activated ?? today);
        await tx.query("insert into activities (lead_id, user_id, kind, body) values ($1, $2, 'assign', $3)",
          [id, admin.id, `Assigned to ${owner.name} · pain point "${painPoint}"`]);
      }
    });
    return done(`${ids.length} ${ids.length === 1 ? "lead" : "leads"} assigned to ${owner.name}. Step 1 is due today.`);
  } catch (e) {
    return failed(e);
  }
}

export async function bulkSetStatus(_: FormState, form: FormData): Promise<FormState> {
  try {
    const admin = await requireAdmin();
    const ids = [...new Set(form.getAll("ids").map(Number).filter(Number.isInteger))];
    const status = str(form, "status");
    if (!ids.length) return { error: "Select at least one lead." };
    if (!(LEAD_STATUSES as readonly string[]).includes(status)) return { error: "Choose a status." };
    const d = await db();
    await d.transaction(async (tx) => {
      for (const id of ids) {
        await tx.query("update leads set status = $2, updated_at = now() where id = $1", [id, status]);
        await tx.query("insert into activities (lead_id, user_id, kind, body) values ($1, $2, 'status', $3)", [id, admin.id, `Status set to ${status}`]);
      }
    });
    return done(`${ids.length} ${ids.length === 1 ? "lead" : "leads"} set to ${status}.`);
  } catch (e) {
    return failed(e);
  }
}

/* ---------- working a lead ---------- */

export async function updateLeadSettings(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    const leadId = Number(form.get("leadId"));
    const status = str(form, "status");
    const disposition = str(form, "disposition");
    const channelPlan = str(form, "channelPlan") || "Email + LinkedIn";
    if (!(LEAD_STATUSES as readonly string[]).includes(status) || !(DISPOSITIONS as readonly string[]).includes(disposition) || !(CHANNEL_PLANS as readonly string[]).includes(channelPlan)) {
      return { error: "Choose a valid status, disposition and channel plan." };
    }
    const d = await db();
    await d.transaction(async (tx) => {
      const lead = await writableLead(tx, user, leadId);
      await tx.query(
        "update leads set status = $2, disposition = $3, channel_plan = $5, activated_on = case when $2 = 'Active' then coalesce(activated_on, $4::date) else activated_on end, updated_at = now() where id = $1",
        [leadId, status, disposition, todayISO(), channelPlan],
      );
      if (status === "Active") await scheduleSteps(tx, leadId, lead.activated_on ? String(lead.activated_on).slice(0, 10) : todayISO());
      await tx.query("insert into activities (lead_id, user_id, kind, body) values ($1, $2, 'status', $3)",
        [leadId, user.id, `Status ${status} · disposition ${disposition} · ${channelPlan}`]);
    });
    return done("Lead updated.");
  } catch (e) {
    return failed(e);
  }
}

export async function markStepSent(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    const leadId = Number(form.get("leadId"));
    const stepId = Number(form.get("stepId"));
    const undo = form.get("undo") === "1";
    const d = await db();
    let label = "";
    await d.transaction(async (tx) => {
      await writableLead(tx, user, leadId);
      const [step] = await tx.query<{ step_number: number; channel: string; sent_at: unknown }>(
        `select s.step_number, s.channel, ls.sent_at from lead_steps ls join sequence_steps s on s.id = ls.step_id
          where ls.lead_id = $1 and ls.step_id = $2 for update of ls`,
        [leadId, stepId],
      );
      if (!step) throw new Error("This step isn't scheduled for the lead. Activate the lead first.");
      label = `Step ${step.step_number} · ${step.channel}`;
      if (undo) {
        await tx.query("update lead_steps set sent_at = null, sent_by = null where lead_id = $1 and step_id = $2", [leadId, stepId]);
        await tx.query("insert into activities (lead_id, user_id, kind, body) values ($1, $2, 'step', $3)", [leadId, user.id, `Reopened ${label}`]);
      } else {
        if (step.sent_at) throw new Error(`${label} is already marked sent.`);
        await tx.query("update lead_steps set sent_at = now(), sent_by = $3 where lead_id = $1 and step_id = $2", [leadId, stepId, user.id]);
        await tx.query("insert into activities (lead_id, user_id, kind, body) values ($1, $2, 'step', $3)", [leadId, user.id, `Sent ${label}`]);
      }
    });
    return done(undo ? `${label} reopened.` : `${label} marked sent.`);
  } catch (e) {
    return failed(e);
  }
}

export async function logCall(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    const leadId = Number(form.get("leadId"));
    const phone = str(form, "phone", 100);
    const outcome = str(form, "outcome");
    const notes = str(form, "notes");
    const callback = str(form, "callback", 10);
    if (!(await listCallOutcomes()).includes(outcome)) return { error: "Choose how the call went." };
    if (callback && !isValidISODate(callback)) return { error: "The callback date isn't a valid date." };
    if (callback && callback < todayISO()) return { error: "The callback date is in the past. Pick today or later." };
    const d = await db();
    await d.transaction(async (tx) => {
      await writableLead(tx, user, leadId);
      await tx.query(
        "insert into activities (lead_id, user_id, kind, outcome, phone, body, callback_on) values ($1, $2, 'call', $3, $4, $5, $6)",
        [leadId, user.id, outcome, phone, notes, callback || null],
      );
      // Logging a call settles any open callback; a new date replaces it.
      await tx.query(
        `update leads set callback_on = $2, updated_at = now(),
                disposition = case when $3 = 'Meeting booked' then 'Meeting booked' else disposition end
          where id = $1`,
        [leadId, callback || null, outcome],
      );
    });
    return done(callback ? `Call logged. Callback set for ${callback}.` : "Call logged.");
  } catch (e) {
    return failed(e);
  }
}

export async function addNote(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    const leadId = Number(form.get("leadId"));
    const body = str(form, "body");
    if (!body) return { error: "Write a note first." };
    const d = await db();
    await d.transaction(async (tx) => {
      await writableLead(tx, user, leadId);
      await tx.query("insert into activities (lead_id, user_id, kind, body) values ($1, $2, 'note', $3)", [leadId, user.id, body]);
    });
    return done("Note saved.");
  } catch (e) {
    return failed(e);
  }
}

/* ---------- sequence + import (admin) ---------- */

export async function saveStep(_: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin();
    const id = Number(form.get("stepId"));
    const subject = str(form, "subject", 300);
    const body = str(form, "body", 8000);
    const subjectTitled = str(form, "subjectTitled", 300);
    const bodyTitled = str(form, "bodyTitled", 8000);
    const dayOffset = Number(form.get("dayOffset"));
    if (!Number.isInteger(dayOffset) || dayOffset < 0 || dayOffset > 90) return { error: "Send day must be a whole number from 0 to 90." };
    if (!body) return { error: "The message can't be empty." };
    const d = await db();
    const [step] = await d.query<{ channel: string; step_number: number }>(
      "update sequence_steps set subject = $2, body = $3, day_offset = $4, subject_titled = $5, body_titled = $6 where id = $1 returning channel, step_number",
      [id, subject, body, dayOffset, subjectTitled, bodyTitled],
    );
    if (!step) return { error: "That step no longer exists." };
    return done(`Step ${step.step_number} · ${step.channel} saved. New activations use the new send day.`);
  } catch (e) {
    return failed(e);
  }
}

export async function savePainPoints(_: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin();
    const labels = [...new Set(str(form, "painPoints", 8000).split("\n").map((s) => s.trim()).filter(Boolean))];
    if (!labels.length) return { error: "Keep at least one pain point." };
    const d = await db();
    await d.transaction(async (tx) => {
      await tx.query("delete from pain_points where label <> all($1::text[])", [labels]);
      for (const label of labels) await tx.query("insert into pain_points (label) values ($1) on conflict (label) do nothing", [label]);
    });
    return done(`${labels.length} pain points saved.`);
  } catch (e) {
    return failed(e);
  }
}

export async function saveDailyLimits(_: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin();
    const values: [string, string][] = [];
    for (const [key, label] of [["daily_email_limit", "Email"], ["daily_linkedin_limit", "LinkedIn"]] as const) {
      const v = str(form, key, 10);
      if (v !== "" && (!/^\d+$/.test(v) || Number(v) > 10000)) return { error: `The ${label} limit must be a whole number from 0 to 10000, or blank for no limit.` };
      values.push([key, v]);
    }
    const d = await db();
    await d.transaction(async (tx) => {
      for (const [key, value] of values) {
        await tx.query("insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value", [key, value]);
      }
    });
    return done("Daily limits saved.");
  } catch (e) {
    return failed(e);
  }
}

export async function saveCallOutcomes(_: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin();
    const list = [...new Set(str(form, "outcomes", 4000).split(/\r?\n/).map((o) => o.trim().slice(0, 60)).filter(Boolean))];
    const missing = REQUIRED_OUTCOMES.filter((o) => !list.includes(o));
    if (missing.length) return { error: `Keep ${missing.map((m) => `"${m}"`).join(", ")}: the follow-up lists and meeting tracking rely on them.` };
    if (list.length > 30) return { error: "Keep it to 30 outcomes or fewer." };
    const d = await db();
    await d.query("insert into settings (key, value) values ('call_outcomes', $1) on conflict (key) do update set value = excluded.value", [list.join("\n")]);
    return done(`${list.length} call outcomes saved.`);
  } catch (e) {
    return failed(e);
  }
}

/* ---------- lead upload ---------- */

export type SheetCheck = {
  name: string;
  rows: number;
  matched: number;
  missingRequired: string[];
  extra: string[];
  fresh: number;
  duplicates: number;
  possible: number;
  invalidEmail: number;
  unverifiedEmail: number;
};
/** One row the check flagged: a definite duplicate (always skipped) or a possible one (the admin decides). */
export type FlaggedRow = {
  key: string; sheet: string; row: number; name: string; company: string; email: string;
  kind: "definite" | "possible"; reason: string; matches: string;
};
export type PreviewState = { sheets?: SheetCheck[]; flagged?: FlaggedRow[]; file?: string; error?: string } | null;
export type ImportState = { ok?: string; error?: string; skipped?: string[] } | null;

const MAX_UPLOAD = 30_000_000;

async function uploadedFile(form: FormData): Promise<File> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose the leads workbook (.xlsx) or a CSV file.");
  if (file.size > MAX_UPLOAD) throw new Error("That file is over 30 MB. Split it into smaller workbooks.");
  return file;
}

const candidate = (l: ImportedLead): Candidate => ({
  email: l.email, contactId: l.contact_id, linkedin: l.linkedin_url,
  first: l.first_name, last: l.last_name, company: l.company, phones: [l.phone_work, l.phone_mobile, l.phone_home],
});
const who = (l: ImportedLead) => `${l.first_name} ${l.last_name}`.trim() || "(No name)";
const rowKey = (sheet: string, row: number) => `${sheet}::${row}`;

type Classified = { sheet: string; row: number; lead: ImportedLead; match: Match | null };

/**
 * Walk the sheets in order and classify every row against the CRM and the rows before it.
 * Rows that are imported (new, or a possible duplicate the admin allowed) join the index, so later repeats are caught.
 */
function classify(sheets: Sheet[], index: DuplicateIndex, allow: Set<string>): Classified[] {
  const out: Classified[] = [];
  for (const sheet of sheets) {
    sheet.rows.forEach((raw, i) => {
      const lead = mapRow(sheet.header, raw);
      if (!lead.first_name && !lead.last_name && !lead.email) return;
      const row = i + 2;
      const match = index.check(candidate(lead));
      out.push({ sheet: sheet.name, row, lead, match });
      const imported = !match || (match.kind === "possible" && allow.has(rowKey(sheet.name, row)));
      if (imported) index.add(candidate(lead), `${who(lead)}${lead.email ? ` <${lead.email}>` : ""} (${sheet.name}, row ${row})`);
    });
  }
  return out;
}

/** Step 1: read the workbook, check each sheet against the template and every row for duplicates. Saves nothing. */
export async function previewImport(_: PreviewState, form: FormData): Promise<PreviewState> {
  try {
    await requireAdmin();
    const file = await uploadedFile(form);
    const sheets = await readWorkbook(file);
    const d = await db();
    const usable = sheets.filter((s) => !checkHeader(s.header).missingRequired.length);
    const rows = classify(usable, await DuplicateIndex.fromDb(d), new Set());
    const flagged: FlaggedRow[] = rows
      .filter((r) => r.match)
      .map((r) => ({
        key: rowKey(r.sheet, r.row), sheet: r.sheet, row: r.row, name: who(r.lead), company: r.lead.company, email: r.lead.email,
        kind: r.match!.kind, reason: r.match!.reason, matches: r.match!.with,
      }));
    return {
      file: file.name,
      flagged: flagged.slice(0, 5000),
      sheets: sheets.map((sheet) => {
        const check = checkHeader(sheet.header);
        const mine = rows.filter((r) => r.sheet === sheet.name);
        const fresh = mine.filter((r) => !r.match);
        return {
          name: sheet.name, rows: sheet.rows.length, matched: check.matched, missingRequired: [...check.missingRequired], extra: check.extra.slice(0, 12),
          fresh: fresh.length,
          duplicates: mine.filter((r) => r.match?.kind === "definite").length,
          possible: mine.filter((r) => r.match?.kind === "possible").length,
          invalidEmail: fresh.filter((r) => emailCheck(r.lead.email_status, r.lead.email) === "invalid").length,
          unverifiedEmail: fresh.filter((r) => emailCheck(r.lead.email_status, r.lead.email) === "unverified").length,
        };
      }),
    };
  } catch (e) {
    unstable_rethrow(e);
    return { error: e instanceof Error ? e.message : "The file couldn't be read." };
  }
}

/**
 * Step 2: import the chosen sheets. Definite duplicates are skipped; possible duplicates are skipped unless the admin
 * ticked "Import anyway"; leads with an invalid email come in with status Bad so nobody emails them.
 * The check runs again inside the transaction, under a lock, so two uploads at once can't both add the same person.
 */
export async function importLeads(_: ImportState, form: FormData): Promise<ImportState> {
  try {
    const admin = await requireAdmin();
    const file = await uploadedFile(form);
    const chosen = new Set(form.getAll("sheets").map(String));
    const allow = new Set(form.getAll("allow").map(String));
    if (!chosen.size) return { error: "Tick at least one sheet to import." };
    const sheets = (await readWorkbook(file)).filter((s) => chosen.has(s.name));
    if (!sheets.length) return { error: "Those sheets aren't in this file. Check the file again." };
    for (const sheet of sheets) {
      const { missingRequired } = checkHeader(sheet.header);
      if (missingRequired.length) return { error: `"${sheet.name}" doesn't follow the template: it has no ${missingRequired.join(", ")} column.` };
    }

    const d = await db();
    const skipped: string[] = [];
    let created = 0, bad = 0;
    await d.transaction(async (tx) => {
      await tx.query("select pg_advisory_xact_lock(4242001)");
      const rows = classify(sheets, await DuplicateIndex.fromDb(tx), allow);
      const leads: ImportedLead[] = [];
      for (const r of rows) {
        if (r.match && !(r.match.kind === "possible" && allow.has(rowKey(r.sheet, r.row)))) {
          skipped.push(`${r.sheet}, row ${r.row}: ${who(r.lead)} · ${r.match.reason.charAt(0).toLowerCase() + r.match.reason.slice(1)} as ${r.match.with}`);
          continue;
        }
        if (r.lead.timezone && !isValidTimeZone(r.lead.timezone)) r.lead.timezone = "";
        if (!r.lead.timezone) r.lead.timezone = guessTimezone(r.lead.country, r.lead.state);
        leads.push(r.lead);
      }

      const cols = [...LEAD_COLUMNS, "linkedin_key", "status", "source_fields"] as const;
      // Insert in chunks so a 3,000-row sheet is a handful of statements, not thousands.
      for (let start = 0; start < leads.length; start += 200) {
        const chunk = leads.slice(start, start + 200);
        const params: unknown[] = [];
        const values = chunk.map((lead) => {
          const invalid = emailCheck(lead.email_status, lead.email) === "invalid";
          if (invalid) bad++;
          const row = cols.map((c) => {
            const v = c === "source_fields" ? JSON.stringify(lead.source_fields)
              : c === "linkedin_key" ? linkedinKey(lead.linkedin_url)
              : c === "status" ? (invalid ? "Bad" : "Inactive")
              : lead[c];
            params.push(v);
            return c === "source_fields" ? `$${params.length}::jsonb` : `$${params.length}`;
          });
          return `(${row.join(", ")})`;
        });
        const ids = await tx.query<{ id: number }>(`insert into leads (${cols.join(", ")}) values ${values.join(", ")} returning id`, params);
        const actParams: unknown[] = [admin.id, `Uploaded from ${file.name}`];
        const actValues = ids.map((r) => { actParams.push(r.id); return `($${actParams.length}, $1, 'import', $2)`; });
        if (actValues.length) await tx.query(`insert into activities (lead_id, user_id, kind, body) values ${actValues.join(", ")}`, actParams);
      }
      created = leads.length;
    });
    revalidatePath("/", "layout");
    const parts = [`${created} ${created === 1 ? "lead" : "leads"} imported as unassigned`];
    if (bad) parts.push(`${bad} with an invalid email set to Bad`);
    if (skipped.length) parts.push(`${skipped.length} duplicates skipped`);
    return { ok: parts.join("; ") + ".", skipped: skipped.slice(0, 1000) };
  } catch (e) {
    unstable_rethrow(e);
    return { error: e instanceof Error ? e.message : "The import failed. Nothing was saved." };
  }
}

/* ---------- duplicates already in the CRM ---------- */

const TEXT_FIELDS = [
  "title", "company", "email", "email_status", "phone_work", "phone_home", "phone_mobile", "phone_corporate", "phone_other", "phone_company",
  "linkedin_url", "linkedin_key", "company_linkedin_url", "website", "industry", "employees", "seniority", "departments",
  "city", "state", "country", "timezone", "contact_id",
] as const;

/** Merge leads into the one kept: calls, comments and steps move over, blank fields fill in, the others are deleted. */
export async function mergeLeads(_: FormState, form: FormData): Promise<FormState> {
  try {
    const admin = await requireAdmin();
    const keepId = Number(form.get("keep"));
    const mergeIds = [...new Set(form.getAll("ids").map(Number))].filter((id) => Number.isInteger(id) && id !== keepId);
    if (!Number.isInteger(keepId) || !mergeIds.length) return { error: "Choose the lead to keep." };
    const d = await db();
    let names: string[] = [];
    await d.transaction(async (tx) => {
      const [keep] = await tx.query<Record<string, unknown>>("select * from leads where id = $1 for update", [keepId]);
      if (!keep) throw new Error("The lead to keep no longer exists. Refresh the list.");
      const others = await tx.query<Record<string, unknown>>("select * from leads where id = any($1::int[]) for update", [mergeIds]);
      if (others.length !== mergeIds.length) throw new Error("One of these leads no longer exists. Refresh the list.");
      names = others.map((o) => `${o.first_name} ${o.last_name}`.trim() + (o.email ? ` <${o.email}>` : ""));

      // Field values: keep's own, else the first merged lead that has one.
      const fill: Record<string, unknown> = {};
      for (const f of TEXT_FIELDS) {
        if (String(keep[f] ?? "").trim()) continue;
        const donor = others.find((o) => String(o[f] ?? "").trim());
        if (donor) fill[f] = donor[f];
      }
      if (keep.owner_id == null) {
        const owned = others.find((o) => o.owner_id != null);
        if (owned) for (const f of ["owner_id", "status", "disposition", "pain_point", "activated_on", "channel_plan", "callback_on"]) fill[f] = owned[f];
      }
      if (!keep.callback_on && !fill.callback_on) {
        const cb = others.find((o) => o.callback_on);
        if (cb) fill.callback_on = cb.callback_on;
      }
      if (JSON.stringify(keep.source_fields ?? []) === "[]") {
        const src = others.find((o) => JSON.stringify(o.source_fields ?? []) !== "[]");
        if (src) fill.source_fields = JSON.stringify(src.source_fields);
      }

      for (const id of mergeIds) {
        await tx.query("update activities set lead_id = $1 where lead_id = $2", [keepId, id]);
        // Steps: copy a sent mark across, and any step row the kept lead doesn't have.
        await tx.query(
          `update lead_steps k set sent_at = m.sent_at, sent_by = m.sent_by
             from lead_steps m where k.lead_id = $1 and m.lead_id = $2 and m.step_id = k.step_id and k.sent_at is null and m.sent_at is not null`,
          [keepId, id],
        );
        await tx.query(
          `insert into lead_steps (lead_id, step_id, due_on, sent_at, sent_by)
           select $1, step_id, due_on, sent_at, sent_by from lead_steps where lead_id = $2
           on conflict (lead_id, step_id) do nothing`,
          [keepId, id],
        );
      }
      // Delete the others first so their email, contact ID and LinkedIn are free for the kept lead.
      await tx.query("delete from leads where id = any($1::int[])", [mergeIds]);
      const keys = Object.keys(fill);
      if (keys.length) {
        const sets = keys.map((k, i) => (k === "source_fields" ? `${k} = $${i + 2}::jsonb` : `${k} = $${i + 2}`));
        await tx.query(`update leads set ${sets.join(", ")}, updated_at = now() where id = $1`, [keepId, ...keys.map((k) => fill[k])]);
      }
      await tx.query("insert into activities (lead_id, user_id, kind, body) values ($1, $2, 'status', $3)",
        [keepId, admin.id, `Merged duplicate${names.length > 1 ? "s" : ""}: ${names.join(", ")}`]);
    });
    return done(`Merged ${names.length} duplicate${names.length === 1 ? "" : "s"} into the kept lead.`);
  } catch (e) {
    return failed(e);
  }
}

/** "Not duplicates": remember every pair in the group so it stops showing. */
export async function dismissDuplicates(_: FormState, form: FormData): Promise<FormState> {
  try {
    await requireAdmin();
    const ids = [...new Set(form.getAll("ids").map(Number))].filter(Number.isInteger).sort((a, b) => a - b);
    if (ids.length < 2) return { error: "Nothing to dismiss." };
    const d = await db();
    await d.transaction(async (tx) => {
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++)
          await tx.query("insert into duplicate_dismissals (lead_a, lead_b) values ($1, $2) on conflict do nothing", [ids[i], ids[j]]);
    });
    return done("Marked as different people.");
  } catch (e) {
    return failed(e);
  }
}
