import type { Db } from "./db";

/**
 * Per-lead cached fields that keep list pages fast at 100k+ leads.
 *
 * next action: the lead's first unsent step (only while Active and not closed out, skipping Step 1 LinkedIn on the
 * "Email only" plan), or its callback, whichever is due first. Stored as step_due / step_number / step_channel /
 * next_due. "Today" is never stored: lists compare next_due with today at query time, so nothing goes stale overnight.
 *
 * last call: the newest call activity, for the follow-up lists.
 *
 * Every write that can change these calls the matching refresh with the affected lead ids. Passing ids filters with a
 * plain `= any($1)` so the lead indexes are used; `null` (the one-time fill) runs over every lead.
 */
export async function refreshNextActions(tx: Db, ids: number[] | null): Promise<void> {
  if (ids && !ids.length) return;
  const stepsFor = ids ? "and ls.lead_id = any($1::int[])" : "";
  const leadsFor = ids ? "where l.id = any($1::int[])" : "";
  await tx.query(
    `with ns as (
       select distinct on (ls.lead_id) ls.lead_id, ls.due_on, s.step_number, s.channel
         from lead_steps ls
         join sequence_steps s on s.id = ls.step_id
         join leads lp on lp.id = ls.lead_id
        where ls.sent_at is null
          and not (s.step_number = 1 and s.channel = 'LinkedIn' and lp.channel_plan = 'Email only')
          ${stepsFor}
        order by ls.lead_id, s.position
     ), calc as (
       select l.id,
              case when l.status = 'Active' and l.disposition not in ('Meeting booked', 'Bounced', 'Requested to unsubscribe')
                   then ns.due_on end as step_due,
              ns.step_number, ns.channel,
              case when l.status <> 'Bad' then l.callback_on end as cb_due
         from leads l left join ns on ns.lead_id = l.id
         ${leadsFor}
     )
     update leads l
        set step_due = c.step_due, step_number = c.step_number, step_channel = c.channel, next_due = least(c.step_due, c.cb_due)
       from calc c
      where c.id = l.id`,
    ids ? [ids] : [],
  );
}

export async function refreshLastCall(tx: Db, ids: number[] | null): Promise<void> {
  if (ids && !ids.length) return;
  if (ids) {
    await tx.query(
      `update leads l
          set last_call_id = lc.id, last_call_at = lc.created_at, last_call_outcome = coalesce(lc.outcome, '')
         from leads l2
         left join lateral (
           select a.id, a.created_at, a.outcome from activities a
            where a.lead_id = l2.id and a.kind = 'call'
            order by a.created_at desc, a.id desc limit 1
         ) lc on true
        where l.id = l2.id and l2.id = any($1::int[])`,
      [ids],
    );
    return;
  }
  // Every lead at once: one pass over the calls instead of one lookup per lead.
  await tx.query(
    `with lc as (
       select distinct on (a.lead_id) a.lead_id, a.id, a.created_at, a.outcome
         from activities a where a.kind = 'call'
        order by a.lead_id, a.created_at desc, a.id desc
     )
     update leads l set last_call_id = lc.id, last_call_at = lc.created_at, last_call_outcome = coalesce(lc.outcome, '')
       from lc where lc.lead_id = l.id`,
  );
}

/** One-time fill for databases created before the cache existed (and for freshly seeded ones). */
export async function ensureCaches(db: Db): Promise<void> {
  const [done] = await db.query<{ value: string }>("select value from settings where key = 'cache_version'");
  if (done?.value === "1") return;
  await db.transaction(async (tx) => {
    await refreshNextActions(tx, null);
    await refreshLastCall(tx, null);
    await tx.query("insert into settings (key, value) values ('cache_version', '1') on conflict (key) do update set value = excluded.value");
  });
}
