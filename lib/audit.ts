import "server-only";
import { headers } from "next/headers";
import type { Db } from "./db";
import type { AuditCategory } from "./schema";

/** A before → after pair, shown as "Field: before → after" in the log. */
export type Change = { field: string; from: string; to: string };

export type AuditEntry = {
  category: AuditCategory;
  /** Stable machine name, e.g. "call.logged". */
  action: string;
  /** One readable line: "Logged a call: Interested". */
  summary: string;
  leadId?: number | null;
  leadName?: string;
  /** Everything else, in full: message text, notes, recipients, changes, lead lists. Never passwords or tokens. */
  detail?: Record<string, unknown>;
};

/**
 * Write one row to the activity log. Call it inside the action's transaction where there is one, so the log and
 * the change it describes are saved (or rolled back) together.
 */
export async function audit(q: Pick<Db, "query">, actor: { id: number; name: string } | null, entry: AuditEntry): Promise<void> {
  await q.query(
    `insert into audit_log (user_id, user_name, category, action, summary, lead_id, lead_name, detail)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      actor?.id ?? null, actor?.name ?? "", entry.category, entry.action, entry.summary.slice(0, 500),
      entry.leadId ?? null, entry.leadName ?? "", JSON.stringify(entry.detail ?? {}),
    ],
  );
}

/** Where a sign-in came from: IP address and browser, for the Sign-in entries. */
export async function requestInfo(): Promise<{ ip?: string; browser?: string }> {
  try {
    const h = await headers();
    const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || undefined;
    const browser = h.get("user-agent")?.slice(0, 300) || undefined;
    return { ip, browser };
  } catch {
    return {};
  }
}

/** Only the fields that actually changed. */
export function changes(pairs: [field: string, from: unknown, to: unknown][]): Change[] {
  return pairs
    .map(([field, from, to]) => ({ field, from: String(from ?? ""), to: String(to ?? "") }))
    .filter((c) => c.from !== c.to);
}

/** "status Inactive → Active, disposition None → Replied" */
export function describeChanges(list: Change[]): string {
  return list.map((c) => `${c.field.toLowerCase()} ${c.from || "(blank)"} → ${c.to || "(blank)"}`).join(", ");
}

export const fullName = (r: { first_name?: unknown; last_name?: unknown }) =>
  `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "(No name)";
