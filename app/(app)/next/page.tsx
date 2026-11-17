import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listLeads, VIEWS, type View } from "@/lib/data";
import { first } from "@/lib/url";

/** "Next due", "Next overdue"…: open the first lead of that queue in the Console. */
export default async function NextLeadPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const raw = first((await searchParams).view);
  const view = (VIEWS as readonly string[]).includes(raw) ? (raw as View) : "today";
  const { rows } = await listLeads(user, { view, q: "", owner: "", status: "", sort: "due", dir: "asc", page: 1 });
  const qs = new URLSearchParams();
  if (view !== "today") qs.set("view", view);
  if (rows[0]) qs.set("lead", String(rows[0].id));
  const s = qs.toString();
  redirect(s ? `/?${s}` : "/");
}
