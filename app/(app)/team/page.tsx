import { requireAdmin } from "@/lib/auth";
import { listTeam } from "@/lib/data";
import { senderDomain } from "@/lib/brevo";
import { Page, PageHeader } from "@/components/page";
import { InviteForm, TeamTable } from "./team";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const admin = await requireAdmin();
  const team = await listTeam();
  const admins = team.filter((m) => m.role === "admin" && m.status === "active").length;
  return (
    <Page className="max-w-5xl">
      <PageHeader
        title="Team"
        description={`Who can sign in, and who's an admin. Admins assign leads, upload lists, edit the sequence and manage this page. Invites are for ${senderDomain()} addresses.`}
      />
      <InviteForm domain={senderDomain()} />
      <TeamTable team={team} me={admin.id} lastAdmin={admins <= 1} />
    </Page>
  );
}
