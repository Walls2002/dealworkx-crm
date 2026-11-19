import Link from "next/link";
import { db } from "@/lib/db";
import { readToken } from "@/lib/accounts";
import { AuthShell } from "@/components/auth-shell";
import { AUTH } from "@/components/auth-styles";
import { SetPasswordForm } from "./form";

export const metadata = { title: "Set your password" };

/** Where invite and reset links land: check the link, then let the person choose a password. */
export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = String((await searchParams).token ?? "");
  const info = raw ? await readToken(await db(), raw) : null;

  if (!info) {
    return (
      <AuthShell title="This link has expired" subtitle="Invite and reset links work once, and only for a limited time.">
        <div className="grid gap-4 text-[15px] text-[#4b5563]">
          <p>Request a new reset link below. If you were invited, ask an admin to resend your invite.</p>
          <Link href="/forgot-password" className={`inline-flex items-center justify-center rounded-lg bg-[#FECE14] px-4 py-3 text-[15px] font-semibold text-black hover:bg-[#F2C200] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black`}>
            Get a new link
          </Link>
          <Link href="/login" className={`text-center text-sm ${AUTH.link}`}>Back to sign in</Link>
        </div>
      </AuthShell>
    );
  }

  const invite = info.purpose === "invite";
  return (
    <AuthShell
      title={invite ? `Welcome, ${info.name.split(" ")[0]}` : "Choose a new password"}
      subtitle={invite ? <>Set a password for <span className="font-medium text-[#111827]">{info.email}</span> to start using the CRM.</> : <>For <span className="font-medium text-[#111827]">{info.email}</span>. You&rsquo;ll be signed in right after.</>}
    >
      <SetPasswordForm token={raw} invite={invite} />
    </AuthShell>
  );
}
