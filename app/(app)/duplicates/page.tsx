import { requireAdmin } from "@/lib/auth";
import { listDuplicateGroups } from "@/lib/data";
import { EmptyState, Page, PageHeader } from "@/components/page";
import { DuplicateGroupCard } from "./group";

export const metadata = { title: "Duplicates" };

export default async function DuplicatesPage() {
  await requireAdmin();
  const { groups, total } = await listDuplicateGroups(100);
  return (
    <Page className="max-w-6xl">
      <PageHeader
        title="Possible duplicates"
        description="Leads already in the CRM that look like the same person: same name and company, same personal phone, LinkedIn profile or contact ID. Keep one and merge the rest into it, or mark them as different people."
      />
      {groups.length === 0 ? (
        <EmptyState title="No duplicates found">
          Every lead in the CRM looks like a different person. Uploads are checked before saving, so new duplicates are stopped at the door.
        </EmptyState>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{total} {total === 1 ? "group" : "groups"}{total > groups.length ? `; showing the first ${groups.length}` : ""}.</p>
          <div className="grid gap-4">
            {groups.map((g) => <DuplicateGroupCard key={g.leads.map((l) => l.id).join("-")} group={g} />)}
          </div>
        </>
      )}
    </Page>
  );
}
