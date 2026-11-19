import type { Db } from "./db";

/** Create the step rows of one lead or many (idempotent). Due dates count from the activation date. */
export async function scheduleSteps(tx: Db, leadIds: number | number[], activatedOn: string): Promise<void> {
  const ids = Array.isArray(leadIds) ? leadIds : [leadIds];
  if (!ids.length) return;
  await tx.query(
    `insert into lead_steps (lead_id, step_id, due_on)
     select l.id, s.id, ($2::date + s.day_offset)
       from unnest($1::int[]) as l(id) cross join sequence_steps s
     on conflict (lead_id, step_id) do nothing`,
    [ids, activatedOn],
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
