import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Page, PageHeader } from "@/components/page";
import { ChangePasswordForm } from "./form";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <Page className="max-w-2xl">
      <PageHeader title="My account" description={`${user.name} · ${user.email} · ${user.role === "admin" ? "Admin" : "Member"}`} />
      <ChangePasswordForm />
      <p className="text-sm text-muted-foreground">
        Your email signature is on its own page: <Link href="/signature" className="font-medium text-foreground underline-offset-2 hover:underline">My email signature</Link>.
      </p>
    </Page>
  );
}
