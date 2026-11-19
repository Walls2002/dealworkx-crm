import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { viewCounts } from "@/lib/data";
import { isDemo } from "@/lib/mode";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { Toaster } from "@/components/toast";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [counts, jar] = await Promise.all([viewCounts(user), cookies()]);
  // The sidebar remembers whether it was collapsed (the shadcn sidebar writes this cookie on toggle).
  const open = jar.get("sidebar_state")?.value !== "false";
  return (
    <SidebarProvider defaultOpen={open}>
      <AppSidebar user={{ name: user.name, email: user.email, admin: user.role === "admin" }} counts={counts} />
      <SidebarInset>
        <SiteHeader user={{ name: user.name, email: user.email, admin: user.role === "admin" }} demo={isDemo()} />
        <div className="flex flex-1 flex-col">{children}</div>
        <Toaster />
      </SidebarInset>
    </SidebarProvider>
  );
}
