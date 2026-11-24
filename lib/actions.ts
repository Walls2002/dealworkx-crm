"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { createSession, currentUser, destroySession, requireAdmin, requireUser, type User } from "./auth";
import { checkHeader, LEAD_COLUMNS, mapRow, type ImportedLead } from "./csv";
import { db, type Db } from "./db";
import { canWrite, COMPANY_DEFAULTS, listCallOutcomes, listDuplicateGroups, signatureFor } from "./data";
import { iso, isValidISODate, isValidTimeZone, todayISO } from "./dates";
import { hashPassword, verifyPassword } from "./password";
import { cookies } from "next/headers";
import { appOrigin, brevoConfigured, createToken, linkFor, onTeamDomain, passwordProblem, readToken, sendInviteEmail, sendResetEmail } from "./accounts";
import { CHANNEL_PLANS, DISPOSITIONS, LEAD_STATUSES, REQUIRED_OUTCOMES } from "./schema";
import { guessTimezone } from "./timezones";
import { readWorkbook, type Sheet } from "./workbook";
import { DuplicateIndex, emailCheck, linkedinKey, PersonIndex, type Candidate, type Match } from "./dedupe";
import { scheduleSteps } from "./sequence";
import { refreshLastCall, refreshNextActions } from "./cache";
import { publicAppUrl, sendBrevoEmail, senderDomain, senderProblem } from "./brevo";
import { cleanEmailHtml, emailDocument, textToHtml } from "./email-html";
import { signatureHtml, signatureText } from "./signature";
import { audit, changes, describeChanges, fullName, requestInfo, type Change } from "./audit";
import { merge } from "./sequence";

/** `link`: an invite link to show the admin (to copy) alongside or instead of the email. */
export type FormState = { ok?: string; error?: string; link?: string } | null;

function str(form: FormData, key: string, max = 4000): string {
  return String(form.get(key) ?? "").trim().slice(0, max);
}

async function writableLead(tx: Db, user: User, leadId: number) {
  const [lead] = await tx.query<{
    id: number; owner_id: number | null; status: string; activated_on: unknown; first_name: string; last_name: string;
    disposition: string; channel_plan: string; callback_on: unknown; title: string; company: string; pain_point: string; email: string;
  }>(
    `select id, owner_id, status, activated_on, first_name, last_name, disposition, channel_plan, callback_on, title, company, pain_point, email
       from leads where id = $1 for update`,
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
  const [user] = await d.query<{ id: number; name: string; password_hash: string }>("select id, name, password_hash from users where lower(email) = $1", [email]);
  if (user && !user.password_hash) return { error: "This account isn't set up yet. Use the link in your invite email, or ask an admin to resend it." };
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    // Failed attempts on a real account are logged against it; unknown emails aren't (no account to file them under).
    if (user) await audit(d, { id: user.id, name: user.name }, { category: "Sign-in", action: "auth.signin_failed", summary: "Failed sign-in: wrong password", detail: { email, ...(await requestInfo()) } }).catch(() => {});
    return { error: "That email and password don't match an account." };
  }
  await createSession(user.id);
  await audit(d, { id: user.id, name: user.name }, { category: "Sign-in", action: "auth.signin", summary: "Signed in", detail: { email, ...(await requestInfo()) } }).catch(() => {});
  redirect("/");
}

/* ---------- passwords ---------- */

/** Signed in: change your own password. Other devices are signed out; this one stays signed in. */
export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    const current = String(form.get("current") ?? "");
    const next = String(form.get("password") ?? "");
    const problem = passwordProblem(next, String(form.get("confirm") ?? ""));
    if (problem) return { error: problem };
    const d = await db();
    const [row] = await d.query<{ password_hash: string }>("select password_hash from users where id = $1", [user.id]);
    if (!row || !(await verifyPassword(current, row.password_hash))) return { error: "Your current password isn't right." };
    if (current === next) return { error: "Choose a password different from your current one." };
    const session = (await cookies()).get("dwx_session")?.value ?? "";
    await d.transaction(async (tx) => {
      await tx.query("update users set password_hash = $2 where id = $1", [user.id, await hashPassword(next)]);
      await tx.query("delete from sessions where user_id = $1 and id <> $2", [user.id, session]);
      await audit(tx, user, { category: "Account", action: "account.password_changed", summary: "Changed their password (other devices signed out)", detail: await requestInfo() });
    });
    return { ok: "Password changed. You're still signed in here; other devices were signed out." };
  } catch (e) {
    return failed(e);
  }
}

/**
 * Forgot password: email a one-hour reset link. The reply is the same whether or not the email has an account,
 * so the form can't be used to find out who works here. At most 3 links per account per hour.
 */
export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  try {
    const email = str(form, "email", 200).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter your work email address." };
    if (!brevoConfigured()) return { error: "Password reset emails aren't set up yet. Ask an admin to reset your access." };
    const sent = { ok: `If ${email} has an account, a reset link is on its way. Check your inbox (and spam) in a minute.` };
    const d = await db();
    const [user] = await d.query<{ id: number; name: string; email: string; password_hash: string }>(
      "select id, name, email, password_hash from users where lower(email) = $1",
      [email],
    );
    if (!user) return sent;
    const [{ recent }] = await d.query<{ recent: number }>(
      "select count(*)::int as recent from auth_tokens where user_id = $1 and created_at > now() - interval '1 hour'",
      [user.id],
    );
    if (recent >= 3) return sent;
    // Someone still on an invite gets a fresh invite link instead: same page, same outcome.
    const purpose = user.password_hash ? "reset" : "invite";
    const raw = await createToken(d, Number(user.id), purpose);
    const url = linkFor(await appOrigin(), raw);
    if (purpose === "reset") await sendResetEmail({ name: user.name, email: user.email }, url);
    else await sendInviteEmail({ name: user.name, email: user.email }, "Your admin", url);
    await audit(d, { id: Number(user.id), name: user.name }, {
      category: "Account", action: "account.reset_requested",
      summary: purpose === "reset" ? "Asked for a password reset link" : "Asked for a new invite link (account not set up yet)",
      detail: { email: user.email, ...(await requestInfo()) },
    }).catch(() => {});
    return sent;
  } catch (e) {
    return failed(e);
  }
}

/** From an invite or reset link: set the password, sign every old session out, and sign in here. */
export async function setPasswordFromLink(_: FormState, form: FormData): Promise<FormState> {
  let userId = 0;
  try {
    const raw = String(form.get("token") ?? "");
    const password = String(form.get("password") ?? "");
    const problem = passwordProblem(password, String(form.get("confirm") ?? ""));
    if (problem) return { error: problem };
    const hash = await hashPassword(password);
    const d = await db();
    await d.transaction(async (tx) => {
      const info = await readToken(tx, raw, true);
      if (!info) throw new Error("This link has expired or was already used. Ask for a new one.");
      userId = info.userId;
      await tx.query("update users set password_hash = $2, activated_at = coalesce(activated_at, now()) where id = $1", [userId, hash]);
      await tx.query("update auth_tokens set used_at = now() where user_id = $1 and used_at is null", [userId]);
      await tx.query("delete from sessions where user_id = $1", [userId]);
      await audit(tx, { id: userId, name: info.name }, {
        category: "Account", action: info.purpose === "invite" ? "account.activated" : "account.password_reset",
        summary: info.purpose === "invite" ? "Accepted the invite and set a password" : "Reset their password from an emailed link",
        detail: { email: info.email, ...(await requestInfo()) },
      });
    });
    await createSession(userId);
  } catch (e) {
    return failed(e);
  }
  redirect("/");
}

/* ---------- team (admin) ---------- */

const ROLES = ["admin", "rep"] as const;

/** Invite a teammate on the company domain: their account is created now, and they set a password from the link. */
export async function inviteMember(_: FormState, form: FormData): Promise<FormState> {
  try {
    const admin = await requireAdmin();
    const name = str(form, "name", 80);
    const email = str(form, "email", 200).toLowerCase();
    const role = str(form, "role");
    if (!name) return { error: "Enter their name." };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
    if (!onTeamDomain(email)) return { error: `Invites are for ${senderDomain()} addresses only.` };
    if (!(ROLES as readonly string[]).includes(role)) return { error: "Choose a role." };
    const d = await db();
    const [existing] = await d.query<{ password_hash: string }>("select password_hash from users where lower(email) = $1", [email]);
    if (existing) return { error: existing.password_hash ? `${email} already has an account.` : `${email} is already invited. Use Resend invite in the list.` };
    let raw = "";
    await d.transaction(async (tx) => {
      const [u] = await tx.query<{ id: number }>(
        "insert into users (email, name, role, password_hash, invited_at) values ($1, $2, $3, '', now()) returning id",
        [email, name, role],
      );
      raw = await createToken(tx, Number(u.id), "invite");
      await audit(tx, admin, { category: "Team", action: "team.invited", summary: `Invited ${name} (${email}) as ${role === "admin" ? "an admin" : "a member"}`, detail: { name, email, role: role === "admin" ? "Admin" : "Member" } });
    });
    const url = linkFor(await appOrigin(), raw);
    revalidatePath("/team");
    if (!brevoConfigured()) return { ok: `${name} is invited. Email isn't set up, so send them this link yourself.`, link: url };
    try {
      await sendInviteEmail({ name, email }, admin.name, url);
    } catch (e) {
      return { ok: `${name} is invited, but the email didn't send (${e instanceof Error ? e.message : "Brevo error"}). Send them this link yourself.`, link: url };
    }
    return { ok: `Invite sent to ${email}. The link works for 7 days.`, link: url };
  } catch (e) {
    return failed(e);
  }
}

export async function resendInvite(_: FormState, form: FormData): Promise<FormState> {
  try {
    const admin = await requireAdmin();
    const id = Number(form.get("userId"));
    const d = await db();
    const [u] = await d.query<{ name: string; email: string; password_hash: string }>("select name, email, password_hash from users where id = $1", [id]);
    if (!u) return { error: "That person is no longer in the list. Refresh the page." };
    if (u.password_hash) return { error: `${u.name} has already set a password.` };
    const url = linkFor(await appOrigin(), await createToken(d, id, "invite"));
    await d.query("update users set invited_at = now() where id = $1", [id]);
    await audit(d, admin, { category: "Team", action: "team.invite_resent", summary: `Resent the invite to ${u.name} (${u.email})`, detail: { name: u.name, email: u.email } });
    revalidatePath("/team");
    if (!brevoConfigured()) return { ok: "New link created. Email isn't set up, so send it yourself.", link: url };
    await sendInviteEmail({ name: u.name, email: u.email }, admin.name, url);
    return { ok: `New invite sent to ${u.email}. Older links no longer work.`, link: url };
  } catch (e) {
    return failed(e);
  }
}

/** Withdraw an invite nobody has accepted: the pending account is removed. */
export async function cancelInvite(_: FormState, form: FormData): Promise<FormState> {
  try {
    const admin = await requireAdmin();
    const id = Number(form.get("userId"));
    const d = await db();
    const [u] = await d.query<{ email: string; name: string }>("delete from users where id = $1 and password_hash = '' returning email, name", [id]);
    if (!u) return { error: "That invite was already accepted or removed. Refresh the page." };
    await audit(d, admin, { category: "Team", action: "team.invite_cancelled", summary: `Cancelled the invite for ${u.name} (${u.email})`, detail: { name: u.name, email: u.email } });
    return done(`Invite for ${u.email} cancelled.`);
  } catch (e) {
    return failed(e);
  }
}

/** Make someone an admin or a member. You can't change your own role, and the last admin always stays an admin. */
export async function setRole(_: FormState, form: FormData): Promise<FormState> {
  try {
    const admin = await requireAdmin();
    const id = Number(form.get("userId"));
    const role = str(form, "role");
    if (!(ROLES as readonly string[]).includes(role)) return { error: "Choose Admin or Member." };
    if (id === admin.id) return { error: "You can't change your own role. Ask another admin." };
    const d = await db();
    let name = "";
    await d.transaction(async (tx) => {
      await tx.query("select pg_advisory_xact_lock(4242003)");
      const [u] = await tx.query<{ name: string; role: string }>("select name, role from users where id = $1 for update", [id]);
      if (!u) throw new Error("That person is no longer in the list. Refresh the page.");
      name = u.name;
      if (u.role === "admin" && role === "rep") {
        const [{ n }] = await tx.query<{ n: number }>("select count(*)::int as n from users where role = 'admin' and id <> $1", [id]);
        if (n === 0) throw new Error("Keep at least one admin.");
      }
      await tx.query("update users set role = $2 where id = $1", [id, role]);
      const label = (r: string) => (r === "admin" ? "Admin" : "Member");
      await audit(tx, admin, {
        category: "Team", action: "team.role_changed", summary: `Changed ${u.name}'s role: ${label(u.role)} → ${label(role)}`,
        detail: { person: u.name, changes: changes([["Role", label(u.role), label(role)]]) },
      });
    });
    return done(`${name} is now ${role === "admin" ? "an admin" : "a member"}.`);
  } catch (e) {
    return failed(e);
  }
}

export async function logout(): Promise<void> {
  const user = await currentUser();
  if (user) await audit(await db(), user, { category: "Sign-in", action: "auth.signout", summary: "Signed out" }).catch(() => {});
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
    const [owner] = await d.query<{ id: number; name: string }>("select id, name from users where id = $1 and password_hash <> ''", [ownerId]);
    if (!owner) return { error: "Choose who the leads go to." };
    const known = (await d.query<{ label: string }>("select label from pain_points")).map((p) => p.label);
    if (!known.includes(painPoint)) return { error: "Choose the Step 1 pain point." };
    const today = todayISO();
    let keptBad = 0;
    // Set-based: a handful of statements whatever the selection size (one round trip per lead took ~25 s for 100).
    await d.transaction(async (tx) => {
      const locked = await tx.query<{ id: number; status: string; first_name: string; last_name: string; owner_name: string | null }>(
        `select l.id, l.status, l.first_name, l.last_name, u.name as owner_name
           from leads l left join users u on u.id = l.owner_id where l.id = any($1::int[]) order by l.id for update of l`,
        [ids],
      );
      if (locked.length !== ids.length) throw new Error("A selected lead no longer exists. Nothing was assigned.");
      const one = locked.length === 1 ? locked[0] : null;
      await audit(tx, admin, {
        category: "Assignment", action: "lead.assigned",
        summary: one ? `Assigned ${fullName(one)} to ${owner.name}` : `Assigned ${locked.length} leads to ${owner.name}`,
        leadId: one ? Number(one.id) : null, leadName: one ? fullName(one) : "",
        detail: {
          owner: owner.name, painPoint, count: locked.length,
          leads: locked.map((l) => ({ id: Number(l.id), name: fullName(l), previousOwner: l.owner_name ?? "Unassigned" })),
        },
      });
      keptBad = locked.filter((l) => l.status === "Bad").length;
      await tx.query(
        `update leads set owner_id = $2, pain_point = $3, status = case when status = 'Bad' then 'Bad' else 'Active' end, channel_plan = 'Email + LinkedIn',
                activated_on = coalesce(activated_on, $4::date), updated_at = now() where id = any($1::int[])`,
        [ids, ownerId, painPoint, today],
      );
      await scheduleSteps(tx, ids, today);
      await tx.query("insert into activities (lead_id, user_id, kind, body) select unnest($1::int[]), $2, 'assign', $3",
        [ids, admin.id, `Assigned to ${owner.name} · pain point "${painPoint}"`]);
      await refreshNextActions(tx, ids);
    });
    return done(`${ids.length} ${ids.length === 1 ? "lead" : "leads"} assigned to ${owner.name}. Step 1 is due today.${keptBad ? ` ${keptBad} kept as Bad (invalid email or marked Bad), so they won’t be contacted.` : ""}`);
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
      const before = await tx.query<{ id: number; status: string; first_name: string; last_name: string }>(
        "select id, status, first_name, last_name from leads where id = any($1::int[]) order by id for update", [ids]);
      const changed = await tx.query<{ id: number }>("update leads set status = $2, updated_at = now() where id = any($1::int[]) returning id", [ids, status]);
      const found = changed.map((r) => Number(r.id));
      const one = before.length === 1 ? before[0] : null;
      await audit(tx, admin, {
        category: "Lead work", action: "lead.bulk_status",
        summary: one ? `Set ${fullName(one)} to ${status} (was ${one.status})` : `Set ${before.length} leads to ${status}`,
        leadId: one ? Number(one.id) : null, leadName: one ? fullName(one) : "",
        detail: { status, count: before.length, leads: before.map((l) => ({ id: Number(l.id), name: fullName(l), previousStatus: l.status })) },
      });
      await tx.query("insert into activities (lead_id, user_id, kind, body) select unnest($1::int[]), $2, 'status', $3", [found, admin.id, `Status set to ${status}`]);
      await refreshNextActions(tx, found);
    });
    return done(`${ids.length} ${ids.length === 1 ? "lead" : "leads"} set to ${status}.`);
  } catch (e) {
    return failed(e);
  }
}

/* ---------- removing leads from the list (admin) ---------- */

const leadIds = (form: FormData) => [...new Set(form.getAll("ids").map(Number).filter(Number.isInteger))];

/**
 * Remove leads from the list: they leave every list and count and the Removed leads list holds them.
 * Their sequence stops (steps not yet sent are deleted; sent ones stay as history) and any callback is cleared.
 * Nothing else is deleted, so a lead can be restored with its calls, comments and emails.
 */
export async function removeLeads(_: FormState, form: FormData): Promise<FormState> {
  try {
    const admin = await requireAdmin();
    const ids = leadIds(form);
    if (!ids.length || ids.length > 500) return { error: "Select between 1 and 500 leads." };
    const d = await db();
    let count = 0;
    await d.transaction(async (tx) => {
      const leads = await tx.query<{ id: number; first_name: string; last_name: string; owner_name: string | null; status: string; callback_on: unknown }>(
        `select l.id, l.first_name, l.last_name, u.name as owner_name, l.status, l.callback_on
           from leads l left join users u on u.id = l.owner_id
          where l.id = any($1::int[]) and l.removed_at is null order by l.id for update of l`,
        [ids],
      );
      if (!leads.length) throw new Error("Those leads were already removed. Refresh the list.");
      const found = leads.map((l) => Number(l.id));
      const stopped = await tx.query<{ lead_id: number }>("delete from lead_steps where lead_id = any($1::int[]) and sent_at is null returning lead_id", [found]);
      await tx.query("update leads set removed_at = now(), removed_by = $2, callback_on = null, updated_at = now() where id = any($1::int[])", [found, admin.id]);
      await tx.query("insert into activities (lead_id, user_id, kind, body) select unnest($1::int[]), $2, 'status', 'Removed from the list (sequence stopped)'", [found, admin.id]);
      await refreshNextActions(tx, found);
      const one = leads.length === 1 ? leads[0] : null;
      await audit(tx, admin, {
        category: "Lead work", action: "lead.removed",
        summary: one ? `Removed ${fullName(one)} from the list` : `Removed ${leads.length} leads from the list`,
        leadId: one ? Number(one.id) : null, leadName: one ? fullName(one) : "",
        detail: {
          count: leads.length, unsentStepsCancelled: stopped.length,
          leads: leads.map((l) => ({ id: Number(l.id), name: fullName(l), previousOwner: l.owner_name ?? "Unassigned", previousStatus: l.status })),
        },
      });
      count = leads.length;
    });
    await listDuplicateGroups(0);
    return done(count === 1 ? "Lead removed from the list. Find it under Removed leads." : `${count} leads removed from the list. Find them under Removed leads.`);
  } catch (e) {
    return failed(e);
  }
}

/**
 * Put removed leads back. They return to the list they belong in (Lead List when unassigned, their owner's queue
 * otherwise). An assigned, Active lead picks its sequence up again: the steps it hadn't sent are rescheduled from today.
 */
export async function restoreLeads(_: FormState, form: FormData): Promise<FormState> {
  try {
    const admin = await requireAdmin();
    const ids = leadIds(form);
    if (!ids.length || ids.length > 500) return { error: "Select between 1 and 500 leads." };
    const d = await db();
    let count = 0;
    await d.transaction(async (tx) => {
      const leads = await tx.query<{ id: number; first_name: string; last_name: string; owner_id: number | null; status: string }>(
        "select id, first_name, last_name, owner_id, status from leads where id = any($1::int[]) and removed_at is not null order by id for update",
        [ids],
      );
      if (!leads.length) throw new Error("Those leads are already back in the list. Refresh the page.");
      const found = leads.map((l) => Number(l.id));
      await tx.query("update leads set removed_at = null, removed_by = null, updated_at = now() where id = any($1::int[])", [found]);
      const resume = leads.filter((l) => l.owner_id != null && l.status === "Active").map((l) => Number(l.id));
      if (resume.length) await scheduleSteps(tx, resume, todayISO());
      await tx.query("insert into activities (lead_id, user_id, kind, body) select unnest($1::int[]), $2, 'status', 'Restored to the list'", [found, admin.id]);
      await refreshNextActions(tx, found);
      const one = leads.length === 1 ? leads[0] : null;
      await audit(tx, admin, {
        category: "Lead work", action: "lead.restored",
        summary: one ? `Restored ${fullName(one)} to the list` : `Restored ${leads.length} leads to the list`,
        leadId: one ? Number(one.id) : null, leadName: one ? fullName(one) : "",
        detail: { count: leads.length, sequenceResumed: resume.length, leads: leads.map((l) => ({ id: Number(l.id), name: fullName(l) })) },
      });
      count = leads.length;
    });
    await listDuplicateGroups(0);
    return done(count === 1 ? "Lead restored to the list." : `${count} leads restored to the list.`);
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
      if (status === "Active") await scheduleSteps(tx, leadId, iso(lead.activated_on) ?? todayISO());
      await tx.query("insert into activities (lead_id, user_id, kind, body) values ($1, $2, 'status', $3)",
        [leadId, user.id, `Status ${status} · disposition ${disposition} · ${channelPlan}`]);
      const diff = changes([["Status", lead.status, status], ["Disposition", lead.disposition, disposition], ["Step 1 channels", lead.channel_plan, channelPlan]]);
      await audit(tx, user, {
        category: "Lead work", action: "lead.updated",
        summary: diff.length ? `Updated the lead: ${describeChanges(diff)}` : "Saved the lead's status (nothing changed)",
        leadId, leadName: fullName(lead), detail: { changes: diff, status, disposition, channelPlan },
      });
      await refreshNextActions(tx, [leadId]);
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
      const lead = await writableLead(tx, user, leadId);
      const [step] = await tx.query<{ step_number: number; channel: string; sent_at: unknown; subject: string; body: string; subject_titled: string; body_titled: string }>(
        `select s.step_number, s.channel, ls.sent_at, s.subject, s.body, s.subject_titled, s.body_titled
           from lead_steps ls join sequence_steps s on s.id = ls.step_id
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
      // The step's message as the lead would have read it (sent outside the CRM, e.g. on LinkedIn). Both versions,
      // since the rep picks General or Job-title aligned when copying it.
      const fields = { first_name: lead.first_name, last_name: lead.last_name, company: lead.company, title: lead.title, pain_point: lead.pain_point, sender: user.name };
      await audit(tx, user, {
        category: "Lead work", action: undo ? "step.reopened" : "step.marked_sent",
        summary: undo ? `Reopened ${label} (marked as not sent)` : `Marked ${label} as sent`,
        leadId, leadName: fullName(lead),
        detail: {
          step: label,
          ...(!undo && {
            subject: merge(step.subject, fields) || undefined,
            message: merge(step.body, fields),
            ...(step.body_titled && { jobTitleSubject: merge(step.subject_titled, fields) || undefined, jobTitleMessage: merge(step.body_titled, fields) }),
          }),
        },
      });
      await refreshNextActions(tx, [leadId]);
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
      const lead = await writableLead(tx, user, leadId);
      await tx.query(
        "insert into activities (lead_id, user_id, kind, outcome, phone, body, callback_on) values ($1, $2, 'call', $3, $4, $5, $6)",
        [leadId, user.id, outcome, phone, notes, callback || null],
      );
      await audit(tx, user, {
        category: "Lead work", action: "call.logged", summary: `Logged a call: ${outcome}`, leadId, leadName: fullName(lead),
        detail: {
          outcome, phone, message: notes || undefined, callback: callback || undefined,
          previousCallback: iso(lead.callback_on) ?? undefined,
          ...(outcome === "Meeting booked" && lead.disposition !== "Meeting booked" && { changes: changes([["Disposition", lead.disposition, "Meeting booked"]]) }),
        },
      });
      // Logging a call settles any open callback; a new date replaces it.
      await tx.query(
        `update leads set callback_on = $2, updated_at = now(),
                disposition = case when $3 = 'Meeting booked' then 'Meeting booked' else disposition end
          where id = $1`,
        [leadId, callback || null, outcome],
      );
      await refreshNextActions(tx, [leadId]);
      await refreshLastCall(tx, [leadId]);
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
      const lead = await writableLead(tx, user, leadId);
      await tx.query("insert into activities (lead_id, user_id, kind, body) values ($1, $2, 'note', $3)", [leadId, user.id, body]);
      await audit(tx, user, { category: "Lead work", action: "comment.added", summary: "Added a comment", leadId, leadName: fullName(lead), detail: { message: body } });
    });
    return done("Comment saved.");
  } catch (e) {
    return failed(e);
  }
}

/**
 * Send an email to the lead through Brevo, from the signed-in user's own address. With a step, the step is
 * claimed first (so two clicks or two people can't send it twice), then marked sent once Brevo accepts it.
 */
/** The composer's subject and message as a finished email (cleaned HTML + signature, and the plain-text version). */
async function composedEmail(user: User, form: FormData): Promise<{ error: string } | { subject: string; body: string; html: string; text: string }> {
  const subject = str(form, "subject", 300);
  // The plain-text version (for the text part and the activity log) and the formatted HTML from the editor.
  const body = str(form, "body", 20000).replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n");
  const rawHtml = String(form.get("html") ?? "").slice(0, 200_000);
  const problem = senderProblem(user.email);
  if (problem) return { error: problem };
  if (!subject) return { error: "Add a subject." };
  if (!body) return { error: "Write the message first." };
  const content = (rawHtml && cleanEmailHtml(rawHtml)) || textToHtml(body);
  const signature = form.get("signature") === "1" ? await signatureFor(user.id) : null;
  return {
    subject,
    body,
    html: emailDocument(content, signature ? signatureHtml(signature, publicAppUrl()) : null),
    text: signature ? `${body}\n\n${signatureText(signature)}` : body,
  };
}

/**
 * "Send test to me": the exact email the lead would get, sent to the user's own address with "[Test]" in the
 * subject, so they can check the formatting and signature first. Nothing is marked sent or logged.
 */
export async function sendTestEmail(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    const email = await composedEmail(user, form);
    if ("error" in email) return email;
    const d = await db();
    const [lead] = await d.query<{ id: number; owner_id: number | null; first_name: string; last_name: string }>(
      "select id, owner_id, first_name, last_name from leads where id = $1", [Number(form.get("leadId"))]);
    if (!lead || !canWrite(user, lead.owner_id == null ? null : Number(lead.owner_id))) return { error: "This lead isn't yours to email. Refresh the list." };
    await sendBrevoEmail({
      from: { name: user.name, email: user.email },
      to: { name: user.name, email: user.email },
      subject: `[Test] ${email.subject}`,
      html: email.html,
      text: email.text,
    });
    await audit(d, user, {
      category: "Email", action: "email.test_sent", summary: `Sent a test email to themselves (${user.email})`,
      leadId: Number(lead.id), leadName: fullName(lead),
      detail: { to: user.email, subject: `[Test] ${email.subject}`, message: email.body, signature: form.get("signature") === "1" ? "Included" : "Not included" },
    }).catch(() => {});
    return { ok: `Test sent to ${user.email}. Check your inbox, then send it to the lead.` };
  } catch (e) {
    return failed(e);
  }
}

export async function sendEmail(_: FormState, form: FormData): Promise<FormState> {
  let claimed: { leadId: number; stepId: number } | null = null;
  // Filled in as the send progresses, so a failure can be logged with what was being sent.
  let attempt: { user: User; leadId: number; leadName: string; to: string; subject: string; message: string; step: string } | null = null;
  try {
    const user = await requireUser();
    const leadId = Number(form.get("leadId"));
    const stepId = Number(form.get("stepId")) || null;
    const email = await composedEmail(user, form);
    if ("error" in email) return email;
    const { subject, body } = email;

    const d = await db();
    const [lead] = await d.query<{ id: number; owner_id: number | null; email: string; first_name: string; last_name: string; status: string; disposition: string }>(
      "select id, owner_id, email, first_name, last_name, status, disposition from leads where id = $1",
      [leadId],
    );
    if (!lead || !canWrite(user, lead.owner_id == null ? null : Number(lead.owner_id))) return { error: "This lead isn't yours to email. Refresh the list." };
    if (!lead.email) return { error: "This lead has no email address." };
    if (lead.status === "Bad") return { error: "This lead is marked Bad (invalid email), so it can't be emailed." };
    if (lead.disposition === "Bounced" || lead.disposition === "Requested to unsubscribe") {
      return { error: `This lead ${lead.disposition === "Bounced" ? "bounced" : "asked to unsubscribe"}, so it can't be emailed.` };
    }

    let stepLabel = "";
    if (stepId) {
      const [step] = await d.query<{ step_number: number; channel: string }>(
        `update lead_steps ls set sent_at = now(), sent_by = $3 from sequence_steps s
          where ls.lead_id = $1 and ls.step_id = $2 and s.id = ls.step_id and ls.sent_at is null and s.channel = 'Email'
          returning s.step_number, s.channel`,
        [leadId, stepId, user.id],
      );
      if (!step) return { error: "This step is already marked sent, or isn't an email step. Refresh the lead." };
      claimed = { leadId, stepId };
      stepLabel = `Step ${step.step_number} · ${step.channel}`;
    }

    const name = `${lead.first_name} ${lead.last_name}`.trim();
    attempt = { user, leadId, leadName: fullName(lead), to: lead.email, subject, message: body, step: stepLabel };
    const messageId = await sendBrevoEmail({
      from: { name: user.name, email: user.email },
      to: { name, email: lead.email },
      subject,
      html: email.html,
      text: email.text,
    });
    claimed = null; // sent: the step stays marked
    attempt = null; // and it isn't a failed send, whatever happens next

    await d.transaction(async (tx) => {
      await tx.query(
        "insert into activities (lead_id, user_id, kind, outcome, subject, body, message_id) values ($1, $2, 'email', $3, $4, $5, $6)",
        [leadId, user.id, stepLabel, subject, body, messageId],
      );
      await audit(tx, user, {
        category: "Email", action: "email.sent",
        summary: stepLabel ? `Sent ${stepLabel} to ${lead.email}` : `Sent an email to ${lead.email}`,
        leadId, leadName: fullName(lead),
        detail: {
          from: user.email, to: lead.email, subject, message: body, step: stepLabel || undefined,
          signature: form.get("signature") === "1" ? "Included" : "Not included", brevoMessageId: messageId,
        },
      });
      if (stepId) await refreshNextActions(tx, [leadId]);
    });
    return done(stepLabel ? `${stepLabel} sent to ${lead.email} and marked sent.` : `Email sent to ${lead.email}.`);
  } catch (e) {
    // Brevo didn't take it: give the step back so it can be sent again.
    if (claimed) {
      const c = claimed;
      await (await db()).query("update lead_steps set sent_at = null, sent_by = null where lead_id = $1 and step_id = $2", [c.leadId, c.stepId]).catch(() => {});
    }
    if (attempt) {
      const a = attempt;
      await audit(await db(), a.user, {
        category: "Email", action: "email.failed", summary: `Email to ${a.to} failed to send`, leadId: a.leadId, leadName: a.leadName,
        detail: { to: a.to, subject: a.subject, message: a.message, step: a.step || undefined, error: e instanceof Error ? e.message : String(e) },
      }).catch(() => {});
    }
    return failed(e);
  }
}

/** A user's own signature details: job title and phone. */
export async function saveSignature(_: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    const title = str(form, "title", 120);
    const phone = str(form, "phone", 60);
    if (phone && !/^[+\d][\d\s().-]{5,}$/.test(phone)) return { error: "Enter the phone number with digits only, like +1 415 555 0101." };
    const d = await db();
    const [before] = await d.query<{ title: string; phone: string }>("select title, phone from users where id = $1", [user.id]);
    await d.query("update users set title = $2, phone = $3 where id = $1", [user.id, title, phone]);
    const diff = changes([["Job title", before?.title, title], ["Phone", before?.phone, phone]]);
    await audit(d, user, { category: "Account", action: "account.signature_saved", summary: diff.length ? `Updated their email signature: ${describeChanges(diff)}` : "Saved their email signature (nothing changed)", detail: { changes: diff } });
    return done("Your signature is saved.");
  } catch (e) {
    return failed(e);
  }
}

/** The company details on every signature (admin). */
export async function saveCompanyDetails(_: FormState, form: FormData): Promise<FormState> {
  try {
    const admin = await requireAdmin();
    const values: [string, string][] = [
      ["company_name", str(form, "company", 80) || COMPANY_DEFAULTS.company_name],
      ["company_website", str(form, "website", 200)],
      ["company_address", str(form, "address", 200)],
    ];
    const d = await db();
    await d.transaction(async (tx) => {
      const before = await readSettings(tx, values.map(([k]) => k));
      for (const [key, value] of values) {
        await tx.query("insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value", [key, value]);
      }
      const labels: Record<string, string> = { company_name: "Company name", company_website: "Website", company_address: "Address" };
      const diff = changes(values.map(([k, v]) => [labels[k], before[k] ?? "", v]));
      await audit(tx, admin, { category: "Settings", action: "settings.company", summary: diff.length ? `Changed the company signature details: ${describeChanges(diff)}` : "Saved the company signature details (nothing changed)", detail: { changes: diff } });
    });
    return done("Company details saved for everyone's signature.");
  } catch (e) {
    return failed(e);
  }
}

/** Current values of some settings rows, for before → after entries in the log. */
async function readSettings(q: Pick<Db, "query">, keys: string[]): Promise<Record<string, string>> {
  const rows = await q.query<{ key: string; value: string }>("select key, value from settings where key = any($1::text[])", [keys]);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/* ---------- sequence + import (admin) ---------- */

export async function saveStep(_: FormState, form: FormData): Promise<FormState> {
  try {
    const admin = await requireAdmin();
    const id = Number(form.get("stepId"));
    const subject = str(form, "subject", 300);
    const body = str(form, "body", 8000);
    const subjectTitled = str(form, "subjectTitled", 300);
    const bodyTitled = str(form, "bodyTitled", 8000);
    const dayOffset = Number(form.get("dayOffset"));
    if (!Number.isInteger(dayOffset) || dayOffset < 0 || dayOffset > 90) return { error: "Send day must be a whole number from 0 to 90." };
    if (!body) return { error: "The message can't be empty." };
    const d = await db();
    let step: { channel: string; step_number: number } | undefined;
    await d.transaction(async (tx) => {
      const [before] = await tx.query<{ subject: string; body: string; day_offset: number; subject_titled: string; body_titled: string }>(
        "select subject, body, day_offset, subject_titled, body_titled from sequence_steps where id = $1 for update", [id]);
      [step] = await tx.query<{ channel: string; step_number: number }>(
        "update sequence_steps set subject = $2, body = $3, day_offset = $4, subject_titled = $5, body_titled = $6 where id = $1 returning channel, step_number",
        [id, subject, body, dayOffset, subjectTitled, bodyTitled],
      );
      if (!step || !before) return;
      const diff = changes([
        ["Send day", before.day_offset, dayOffset], ["Subject", before.subject, subject], ["Message", before.body, body],
        ["Job-title subject", before.subject_titled, subjectTitled], ["Job-title message", before.body_titled, bodyTitled],
      ]);
      await audit(tx, admin, {
        category: "Settings", action: "sequence.step_saved",
        summary: diff.length ? `Edited Step ${step.step_number} · ${step.channel}: ${diff.map((c) => c.field.toLowerCase()).join(", ")}` : `Saved Step ${step.step_number} · ${step.channel} (nothing changed)`,
        detail: { step: `Step ${step.step_number} · ${step.channel}`, changes: diff },
      });
    });
    if (!step) return { error: "That step no longer exists." };
    return done(`Step ${step.step_number} · ${step.channel} saved. New activations use the new send day.`);
  } catch (e) {
    return failed(e);
  }
}

export async function savePainPoints(_: FormState, form: FormData): Promise<FormState> {
  try {
    const admin = await requireAdmin();
    const labels = [...new Set(str(form, "painPoints", 8000).split("\n").map((s) => s.trim()).filter(Boolean))];
    if (!labels.length) return { error: "Keep at least one pain point." };
    const d = await db();
    await d.transaction(async (tx) => {
      const before = (await tx.query<{ label: string }>("select label from pain_points")).map((p) => p.label);
      const added = labels.filter((l) => !before.includes(l)), removed = before.filter((l) => !labels.includes(l));
      await audit(tx, admin, {
        category: "Settings", action: "settings.pain_points",
        summary: added.length || removed.length ? `Edited the pain points: ${added.length} added, ${removed.length} removed` : "Saved the pain points (nothing changed)",
        detail: { added, removed, list: labels },
      });
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
    const admin = await requireAdmin();
    const values: [string, string][] = [];
    for (const [key, label] of [["daily_email_limit", "Email"], ["daily_linkedin_limit", "LinkedIn"]] as const) {
      const v = str(form, key, 10);
      if (v !== "" && (!/^\d+$/.test(v) || Number(v) > 10000)) return { error: `The ${label} limit must be a whole number from 0 to 10000, or blank for no limit.` };
      values.push([key, v]);
    }
    const d = await db();
    await d.transaction(async (tx) => {
      const before = await readSettings(tx, values.map(([k]) => k));
      for (const [key, value] of values) {
        await tx.query("insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value", [key, value]);
      }
      const shown = (v: string | undefined) => (v ? v : "No limit");
      const diff = changes([
        ["Daily email limit", shown(before.daily_email_limit), shown(values[0][1])],
        ["Daily LinkedIn limit", shown(before.daily_linkedin_limit), shown(values[1][1])],
      ]);
      await audit(tx, admin, { category: "Settings", action: "settings.daily_limits", summary: diff.length ? `Changed the daily limits: ${describeChanges(diff)}` : "Saved the daily limits (nothing changed)", detail: { changes: diff } });
    });
    return done("Daily limits saved.");
  } catch (e) {
    return failed(e);
  }
}

export async function saveCallOutcomes(_: FormState, form: FormData): Promise<FormState> {
  try {
    const admin = await requireAdmin();
    const list = [...new Set(str(form, "outcomes", 4000).split(/\r?\n/).map((o) => o.trim().slice(0, 60)).filter(Boolean))];
    const missing = REQUIRED_OUTCOMES.filter((o) => !list.includes(o));
    if (missing.length) return { error: `Keep ${missing.map((m) => `"${m}"`).join(", ")}: the follow-up lists and meeting tracking rely on them.` };
    if (list.length > 30) return { error: "Keep it to 30 outcomes or fewer." };
    const d = await db();
    const before = await listCallOutcomes();
    await d.query("insert into settings (key, value) values ('call_outcomes', $1) on conflict (key) do update set value = excluded.value", [list.join("\n")]);
    const added = list.filter((o) => !before.includes(o)), removed = before.filter((o) => !list.includes(o));
    await audit(d, admin, {
      category: "Settings", action: "settings.call_outcomes",
      summary: added.length || removed.length ? `Edited the call outcomes: ${added.length} added, ${removed.length} removed` : "Saved the call outcomes (order or nothing changed)",
      detail: { added, removed, list },
    });
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
  /** Rows that match a CRM lead on 3 or 4 of the four fields: they update it. */
  updates: number;
  duplicates: number;
  possible: number;
  invalidEmail: number;
  unverifiedEmail: number;
};
/**
 * One row the check flagged: a definite duplicate (always skipped), an update of a CRM lead (3 or 4 of the four fields
 * match), or a possible duplicate (the admin decides: skip, update the existing lead when there is one, or import as new).
 */
export type FlaggedRow = {
  key: string; sheet: string; row: number; name: string; company: string; email: string;
  kind: "definite" | "possible" | "update"; reason: string; matches: string;
  canUpdate: boolean; canImportNew: boolean;
};
export type PreviewState = { sheets?: SheetCheck[]; flagged?: FlaggedRow[]; file?: string; error?: string } | null;
export type ImportState = { ok?: string; error?: string; skipped?: string[]; updated?: string[] } | null;

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
  mobile: l.phone_mobile, other: l.phone_other,
});
const who = (l: ImportedLead) => `${l.first_name} ${l.last_name}`.trim() || "(No name)";
const rowKey = (sheet: string, row: number) => `${sheet}::${row}`;

type RowAction = "new" | "update" | "skip";
type Classified = { sheet: string; row: number; lead: ImportedLead; match: Match | null; action: RowAction };

/**
 * Walk the sheets in order and classify every row against the CRM and the rows before it (rules in lib/dedupe.ts).
 * `allow` = possible duplicates the admin chose to import as new; `override` = possible duplicates the admin chose
 * to apply to the matching CRM lead. Rows that are kept join the index, so later repeats in the file are caught,
 * and a CRM lead is updated by one row at most.
 */
function classify(sheets: Sheet[], index: DuplicateIndex, people: PersonIndex, allow: Set<string>, override: Set<string>): Classified[] {
  const out: Classified[] = [];
  const claimed = new Set<number>();
  for (const sheet of sheets) {
    sheet.rows.forEach((raw, i) => {
      const lead = mapRow(sheet.header, raw);
      if (!lead.first_name && !lead.last_name && !lead.email) return;
      const row = i + 2;
      const key = rowKey(sheet.name, row);
      const c = candidate(lead);
      let match: Match | null;
      const same = people.best(c);
      if (same && same.total >= 2) {
        const why = `${same.total} of 4 match: ${same.matched.join(", ")}`;
        if (claimed.has(same.lead.id)) match = { kind: "definite", reason: "Same person as an earlier row in this file", with: same.lead.label };
        else if (same.total >= 3) match = { kind: "update", reason: why, with: same.lead.label, targetId: same.lead.id };
        else match = { kind: "possible", reason: why, with: same.lead.label, targetId: same.lead.id, canImportNew: index.check(c)?.kind !== "definite" };
      } else {
        match = index.check(c);
      }
      let action: RowAction = "skip";
      if (!match) action = "new";
      else if (match.kind === "update") action = "update";
      else if (match.kind === "possible") {
        if (match.targetId && override.has(key)) action = "update";
        else if (allow.has(key) && match.canImportNew !== false) action = "new";
      }
      if (action === "update") claimed.add(match!.targetId!);
      if (action !== "skip") index.add(c, `${who(lead)}${lead.email ? ` <${lead.email}>` : ""} (${sheet.name}, row ${row})`);
      out.push({ sheet: sheet.name, row, lead, match, action });
    });
  }
  return out;
}

const FIELD_LABELS: Record<string, string> = {
  first_name: "First name", last_name: "Last name", title: "Title", company: "Company", email: "Email", email_status: "Email status",
  contact_id: "Contact ID", phone_work: "Work phone", phone_home: "Home phone", phone_mobile: "Mobile phone", phone_corporate: "Corporate phone",
  phone_other: "Other phone", phone_company: "Company phone", linkedin_url: "LinkedIn", company_linkedin_url: "Company LinkedIn",
  website: "Website", industry: "Industry", employees: "Employees", seniority: "Seniority", departments: "Departments",
  city: "City", state: "State", country: "Country", timezone: "Timezone",
};

/**
 * Apply an uploaded row to an existing lead: every filled cell replaces the old value; blank cells keep it.
 * Only sheet data changes; owner, status, disposition, sequence, calls and comments stay as they are.
 * Unique values (email, contact ID, LinkedIn) are taken only when no other lead already has them.
 */
async function overrideLead(tx: Db, id: number, lead: ImportedLead): Promise<{ id: number; name: string; changes: Change[] } | null> {
  const [old] = await tx.query<Record<string, unknown>>("select * from leads where id = $1 for update", [id]);
  if (!old) return null;
  const next: Record<string, string> = {};
  for (const c of LEAD_COLUMNS) {
    const v = lead[c];
    if (v && v !== String(old[c] ?? "")) next[c] = v;
  }
  if (next.timezone && !isValidTimeZone(next.timezone)) delete next.timezone;
  const taken = async (sql: string, v: string) => (await tx.query(`select 1 from leads where ${sql} and id <> $2 limit 1`, [v, id])).length > 0;
  if (next.email && (await taken("lower(email) = lower($1)", next.email))) delete next.email;
  if (next.contact_id && (await taken("contact_id = $1", next.contact_id))) delete next.contact_id;
  if (next.linkedin_url) {
    const key = linkedinKey(next.linkedin_url);
    if (key && (await taken("linkedin_key = $1", key))) delete next.linkedin_url;
    else next.linkedin_key = key;
  }
  const diff = changes(Object.keys(next).filter((k) => k !== "linkedin_key").map((k) => [FIELD_LABELS[k] ?? k, old[k], next[k]]));
  const keys = Object.keys(next);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  const values: unknown[] = keys.map((k) => next[k]);
  if (lead.source_fields.length) { values.push(JSON.stringify(lead.source_fields)); sets.push(`source_fields = $${values.length + 1}::jsonb`); }
  if (sets.length) await tx.query(`update leads set ${sets.join(", ")}, updated_at = now() where id = $1`, [id, ...values]);
  return { id, name: fullName({ first_name: next.first_name ?? old.first_name, last_name: next.last_name ?? old.last_name }), changes: diff };
}

/** Step 1: read the workbook, check each sheet against the template and every row for duplicates. Saves nothing. */
export async function previewImport(_: PreviewState, form: FormData): Promise<PreviewState> {
  try {
    const admin = await requireAdmin();
    const file = await uploadedFile(form);
    const sheets = await readWorkbook(file);
    const d = await db();
    const usable = sheets.filter((s) => !checkHeader(s.header).missingRequired.length);
    const [index, people] = await Promise.all([DuplicateIndex.fromDb(d), PersonIndex.fromDb(d)]);
    const rows = classify(usable, index, people, new Set(), new Set());
    await audit(d, admin, {
      category: "Import", action: "import.checked", summary: `Checked ${file.name} before uploading (nothing saved)`,
      detail: {
        file: file.name, sheets: sheets.map((s) => `${s.name} (${s.rows.length} rows)`),
        newLeads: rows.filter((r) => !r.match).length, updates: rows.filter((r) => r.match?.kind === "update").length,
        duplicates: rows.filter((r) => r.match?.kind === "definite").length,
        possibleDuplicates: rows.filter((r) => r.match?.kind === "possible").length,
      },
    }).catch(() => {});
    const flagged: FlaggedRow[] = rows
      .filter((r) => r.match)
      .map((r) => ({
        key: rowKey(r.sheet, r.row), sheet: r.sheet, row: r.row, name: who(r.lead), company: r.lead.company, email: r.lead.email,
        kind: r.match!.kind, reason: r.match!.reason, matches: r.match!.with,
        canUpdate: r.match!.targetId != null, canImportNew: r.match!.kind === "possible" && r.match!.canImportNew !== false,
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
          updates: mine.filter((r) => r.match?.kind === "update").length,
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
 * Step 2: import the chosen sheets. Rows matching a CRM lead on 3 or 4 of the four fields update that lead;
 * definite duplicates are skipped; possible duplicates follow the admin's choice (skip by default, update the
 * existing lead, or import as new); leads with an invalid email come in with status Bad so nobody emails them.
 * The check runs again inside the transaction, under a lock, so two uploads at once can't both add the same person.
 */
export async function importLeads(_: ImportState, form: FormData): Promise<ImportState> {
  try {
    const admin = await requireAdmin();
    const file = await uploadedFile(form);
    const chosen = new Set(form.getAll("sheets").map(String));
    const allow = new Set(form.getAll("allow").map(String));
    const override = new Set(form.getAll("override").map(String));
    if (!chosen.size) return { error: "Tick at least one sheet to import." };
    const sheets = (await readWorkbook(file)).filter((s) => chosen.has(s.name));
    if (!sheets.length) return { error: "Those sheets aren't in this file. Check the file again." };
    for (const sheet of sheets) {
      const { missingRequired } = checkHeader(sheet.header);
      if (missingRequired.length) return { error: `"${sheet.name}" doesn't follow the template: it has no ${missingRequired.join(", ")} column.` };
    }

    const d = await db();
    const skipped: string[] = [];
    const updatedReport: string[] = [];
    const updatedLeads: { id: number; name: string; changed: string }[] = [];
    let created = 0, bad = 0, unchanged = 0;
    await d.transaction(async (tx) => {
      await tx.query("select pg_advisory_xact_lock(4242001)");
      const rows = classify(sheets, await DuplicateIndex.fromDb(tx), await PersonIndex.fromDb(tx), allow, override);
      const leads: ImportedLead[] = [];
      for (const r of rows) {
        if (r.action === "skip") {
          const m = r.match!;
          skipped.push(`${r.sheet}, row ${r.row}: ${who(r.lead)} · ${m.reason.charAt(0).toLowerCase() + m.reason.slice(1)} as ${m.with}`);
          continue;
        }
        if (r.action === "update") {
          const res = await overrideLead(tx, r.match!.targetId!, r.lead);
          if (!res) { skipped.push(`${r.sheet}, row ${r.row}: ${who(r.lead)} · the lead it matched no longer exists`); continue; }
          if (!res.changes.length) { unchanged++; continue; }
          const changed = res.changes.map((c) => c.field).join(", ");
          updatedLeads.push({ id: res.id, name: res.name, changed });
          updatedReport.push(`${r.sheet}, row ${r.row}: ${res.name} · ${changed}`);
          await tx.query("insert into activities (lead_id, user_id, kind, body) values ($1, $2, 'import', $3)",
            [res.id, admin.id, `Updated from ${file.name}: ${changed}`]);
          continue;
        }
        if (r.lead.timezone && !isValidTimeZone(r.lead.timezone)) r.lead.timezone = "";
        if (!r.lead.timezone) r.lead.timezone = guessTimezone(r.lead.country, r.lead.state);
        leads.push(r.lead);
      }

      // This upload's batch, for the Lead List's batch picker. Updated leads keep the batch they came in with.
      let batchId: number | null = null;
      if (leads.length) {
        const [b] = await tx.query<{ id: number }>(
          "insert into import_batches (user_id, file_name, lead_count) values ($1, $2, $3) returning id", [admin.id, file.name, leads.length]);
        batchId = Number(b.id);
      }
      const cols = [...LEAD_COLUMNS, "linkedin_key", "status", "source_fields", "batch_id"] as const;
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
              : c === "batch_id" ? batchId
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
      await audit(tx, admin, {
        category: "Import", action: "lead.imported",
        summary: `Uploaded ${file.name}: ${created} new ${created === 1 ? "lead" : "leads"}, ${updatedLeads.length} existing updated`,
        detail: {
          file: file.name, sheets: sheets.map((s) => s.name), imported: created, setToBad: bad,
          updated: updatedLeads.length, matchedWithNothingNew: unchanged,
          possibleDuplicatesAllowed: allow.size, possibleDuplicatesApplied: override.size,
          skipped: skipped.length, updatedLeads: updatedLeads.slice(0, 500), skippedRows: skipped.slice(0, 200),
        },
      });
    });
    await listDuplicateGroups(0); // refresh the duplicates count shown on the Lead List
    revalidatePath("/", "layout");
    const parts = [`${created} new ${created === 1 ? "lead" : "leads"} imported as unassigned`];
    if (updatedLeads.length) parts.push(`${updatedLeads.length} existing ${updatedLeads.length === 1 ? "lead" : "leads"} updated`);
    if (unchanged) parts.push(`${unchanged} matched with nothing new to update`);
    if (bad) parts.push(`${bad} with an invalid email set to Bad`);
    if (skipped.length) parts.push(`${skipped.length} duplicates skipped`);
    return { ok: parts.join("; ") + ".", skipped: skipped.slice(0, 1000), updated: updatedReport.slice(0, 1000) };
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
      for (const f of ["activated_on", "callback_on"]) if (f in fill) fill[f] = iso(fill[f]);
      const keys = Object.keys(fill);
      if (keys.length) {
        const sets = keys.map((k, i) => (k === "source_fields" ? `${k} = $${i + 2}::jsonb` : `${k} = $${i + 2}`));
        await tx.query(`update leads set ${sets.join(", ")}, updated_at = now() where id = $1`, [keepId, ...keys.map((k) => fill[k])]);
      }
      await tx.query("insert into activities (lead_id, user_id, kind, body) values ($1, $2, 'status', $3)",
        [keepId, admin.id, `Merged duplicate${names.length > 1 ? "s" : ""}: ${names.join(", ")}`]);
      await audit(tx, admin, {
        category: "Duplicates", action: "duplicates.merged",
        summary: `Merged ${names.length} duplicate${names.length === 1 ? "" : "s"} into ${fullName(keep)}`,
        leadId: keepId, leadName: fullName(keep),
        detail: { kept: `${fullName(keep)}${keep.email ? ` <${keep.email}>` : ""}`, mergedAway: names, filledIn: Object.keys(fill) },
      });
      await refreshNextActions(tx, [keepId]);
      await refreshLastCall(tx, [keepId]);
    });
    await listDuplicateGroups(0);
    return done(`Merged ${names.length} duplicate${names.length === 1 ? "" : "s"} into the kept lead.`);
  } catch (e) {
    return failed(e);
  }
}

/** "Not duplicates": remember every pair in the group so it stops showing. */
export async function dismissDuplicates(_: FormState, form: FormData): Promise<FormState> {
  try {
    const admin = await requireAdmin();
    const ids = [...new Set(form.getAll("ids").map(Number))].filter(Number.isInteger).sort((a, b) => a - b);
    if (ids.length < 2) return { error: "Nothing to dismiss." };
    const d = await db();
    const people = await d.query<{ id: number; first_name: string; last_name: string; email: string }>(
      "select id, first_name, last_name, email from leads where id = any($1::int[]) order by id", [ids]);
    await audit(d, admin, {
      category: "Duplicates", action: "duplicates.dismissed", summary: `Marked ${people.length} possible duplicates as different people`,
      detail: { leads: people.map((p) => ({ id: Number(p.id), name: fullName(p), email: p.email || undefined })) },
    });
    // Every pair in one statement (ids are sorted, so a < b as the table expects).
    await d.query(
      `insert into duplicate_dismissals (lead_a, lead_b)
       select a, b from unnest($1::int[]) a, unnest($1::int[]) b where a < b
       on conflict do nothing`,
      [ids],
    );
    await listDuplicateGroups(0);
    return done("Marked as different people.");
  } catch (e) {
    return failed(e);
  }
}
