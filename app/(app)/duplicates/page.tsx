import { requireAdmin } from "@/lib/auth";
import { listDuplicateGroups } from "@/lib/data";
import { EmptyState, Page, PageHeader } from "@/components/page";
import { Pager } from "@/components/pager";
import { first } from "@/lib/url";
import { clampPage } from "@/lib/paging";
import { DuplicateGroupCard } from "./group";

export const metadata = { title: "Duplicates" };

export default async function DuplicatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const page = Math.max(1, Number(first((await searchParams).page)) || 1);
  const size = 20;
  const { groups, total } = await listDuplicateGroups(size, (page - 1) * size);
  clampPage(page, total, size, {}, "/duplicates");
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

          <div className="grid gap-4">
            {groups.map((g) => <DuplicateGroupCard key={g.leads.map((l) => l.id).join("-")} group={g} />)}
          </div>
          <Pager page={page} total={total} size={size} params={{ page: page > 1 ? String(page) : undefined }} path="/duplicates" sizes={false} noun={["group", "groups"]} />
        </>
      )}
    </Page>
  );
}
