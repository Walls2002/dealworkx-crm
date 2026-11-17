import type { User } from "@/lib/auth";
import { capacity, getLead, listPainPoints, listUsers } from "@/lib/data";
import { todayISO } from "@/lib/dates";
import { LeadPanel } from "./lead-panel";

/** Loads one lead and renders its slide-over on any list page (calls, follow-ups). */
export async function LeadPanelHost({ user, leadId, ids, hrefFor, closeHref, listLabel }: {
  user: User;
  leadId: number;
  /** The lead ids in the list behind the panel, in order, for Next lead. */
  ids: number[];
  hrefFor: (id: number) => string;
  closeHref: string;
  listLabel: string;
}) {
  const admin = user.role === "admin";
  const [lead, users, painPoints, cap] = await Promise.all([
    getLead(user, leadId),
    listUsers(),
    admin ? listPainPoints() : Promise.resolve([] as string[]),
    admin ? capacity() : Promise.resolve(null),
  ]);
  if (!lead) return <LeadPanel.Missing closeHref={closeHref} />;
  const i = ids.indexOf(lead.id);
  const next = i >= 0 ? ids[i + 1] : undefined;
  return (
    <LeadPanel
      key={lead.id}
      lead={lead}
      nextHref={next ? hrefFor(next) : null}
      position={i >= 0 ? `${listLabel} · ${i + 1} of ${ids.length}` : listLabel}
      today={todayISO()}
      closeHref={closeHref}
      admin={admin}
      users={users.map((u) => ({ id: u.id, name: u.name }))}
      painPoints={painPoints}
      capacity={cap}
    />
  );
}
