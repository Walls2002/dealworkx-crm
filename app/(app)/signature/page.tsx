import { requireUser } from "@/lib/auth";
import { signatureFor } from "@/lib/data";
import { Page, PageHeader } from "@/components/page";
import { SignatureForm } from "./form";

export const metadata = { title: "Email signature" };

export default async function SignaturePage() {
  const user = await requireUser();
  const signature = await signatureFor(user.id);
  return (
    <Page className="max-w-4xl">
      <PageHeader
        title="Your email signature"
        description="Added under every email you send from the CRM. Your name and email come from your account; empty details are left out."
      />
      <SignatureForm signature={signature} admin={user.role === "admin"} />
    </Page>
  );
}
