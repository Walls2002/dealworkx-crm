import type { Db } from "./db";

/** Create the lead's step rows (idempotent). Due dates count from the activation date. */
export async function scheduleSteps(tx: Db, leadId: number, activatedOn: string): Promise<void> {
  await tx.query(
    `insert into lead_steps (lead_id, step_id, due_on)
     select $1, s.id, ($2::date + s.day_offset)
       from sequence_steps s
     on conflict (lead_id, step_id) do nothing`,
    [leadId, activatedOn],
  );
}

export type MergeFields = { first_name: string; last_name: string; company: string; title: string; pain_point: string; sender: string };

/** Fill {{field}} placeholders. Unknown fields stay visible so a broken template is obvious. */
export function merge(template: string, fields: MergeFields): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    const value = (fields as Record<string, string>)[key];
    return value ? value : match;
  });
}

export const MERGE_FIELDS = ["first_name", "last_name", "company", "title", "pain_point", "sender"] as const;
