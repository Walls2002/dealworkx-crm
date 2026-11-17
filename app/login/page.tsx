import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEMO_PASSWORD } from "@/lib/seed";
import { isDemo } from "@/lib/mode";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  const demo = isDemo();
  const users = demo ? await (await db()).query<{ email: string; name: string; role: string }>("select email, name, role from users order by role, name") : [];

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2 self-center font-medium">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/dealworkx-mark.png" alt="" width={28} height={28} className="size-7 rounded-md" />
          DealWorkx CRM
        </div>
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Sign in</CardTitle>
            <CardDescription>Use your DealWorkx work email.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm demoUsers={users} demoPassword={demo ? DEMO_PASSWORD : null} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
