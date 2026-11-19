import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEMO_PASSWORD } from "@/lib/seed";
import { isDemo } from "@/lib/mode";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  const demo = isDemo();
  const users = demo ? await (await db()).query<{ email: string; name: string; role: string }>("select email, name, role from users order by role, name") : [];

  return (
    <AuthShell title="Sign in" subtitle="Use your DealWorkx work email.">
      <LoginForm demoUsers={users} demoPassword={demo ? DEMO_PASSWORD : null} />
    </AuthShell>
  );
}
