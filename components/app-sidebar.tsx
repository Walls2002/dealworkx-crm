"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronRight, CopyCheck, Headset, History, LayoutDashboard, ListOrdered, LogOut, Mail, PhoneCall, ThumbsUp, Upload, Users,
  type LucideIcon,
} from "lucide-react";
import { logout } from "@/lib/actions";
import type { NavCounts } from "@/lib/data";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar } from "./avatar";

export type ShellUser = { name: string; email: string; admin: boolean };

/** Exactly the tabs of the old Apps Script app, in the same order. */
export const TABS: { href: string; label: string; icon: LucideIcon; count?: (c: NavCounts) => number }[] = [
  { href: "/", label: "Console", icon: Headset, count: (c) => c.today },
  { href: "/leads", label: "Lead List", icon: Users, count: (c) => c.unassigned },
  { href: "/interested", label: "Interested Leads", icon: ThumbsUp, count: (c) => c.interested },
  { href: "/email-requested", label: "Email Requested", icon: Mail, count: (c) => c.emailRequested },
  { href: "/calls", label: "Recorded Call History", icon: History },
  { href: "/pipeline", label: "Call Pipeline", icon: PhoneCall },
  { href: "/dashboard", label: "Daily Dashboard", icon: LayoutDashboard },
];

export function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

/** The account menu, shared by the sidebar card and the top bar. */
export function UserMenuContent({ user, onPick, side = "bottom", align = "end" }: { user: ShellUser; onPick?: () => void; side?: "bottom" | "right" | "top"; align?: "start" | "end" }) {
  return (
    <DropdownMenuContent className="min-w-56" side={side} align={align} sideOffset={6}>
      <DropdownMenuLabel className="font-normal">
        <div className="grid text-sm leading-tight">
          <span className="truncate font-medium text-foreground">{user.name}</span>
          <span className="truncate text-xs text-muted-foreground">{user.email} · {user.admin ? "Administrator" : "Team member"}</span>
        </div>
      </DropdownMenuLabel>
      {user.admin && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild><Link href="/sequence" onClick={onPick}><ListOrdered /> Sequence and daily limits</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link href="/import" onClick={onPick}><Upload /> Upload leads</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link href="/duplicates" onClick={onPick}><CopyCheck /> Duplicates</Link></DropdownMenuItem>
        </>
      )}
      <DropdownMenuSeparator />
      <form action={logout}>
        <DropdownMenuItem variant="destructive" asChild>
          <button type="submit" className="w-full"><LogOut /> Sign out</button>
        </DropdownMenuItem>
      </form>
    </DropdownMenuContent>
  );
}

export function AppSidebar({ user, counts }: { user: ShellUser; counts: NavCounts }) {
  const path = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const close = () => isMobile && setOpenMobile(false);

  return (
    <Sidebar>
      <SidebarHeader className="px-3 pt-4">
        <Link href="/" onClick={close} className="flex items-center gap-2.5 rounded-lg p-1.5 hover:bg-sidebar-accent/60">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/dealworkx-mark.png" alt="" width={32} height={32} className="size-8 shrink-0 rounded-lg" />
          <div className="grid leading-tight">
            <span className="text-sm font-semibold">DealWorkx</span>
            <span className="text-xs text-muted-foreground">Team CRM</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-1">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[13px] font-medium text-muted-foreground">Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {TABS.map(({ href, label, icon: Icon, count }) => {
                const n = count ? count(counts) : 0;
                const active = isActive(path, href);
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton asChild isActive={active} className="h-9 text-[13px] text-muted-foreground data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground">
                      <Link href={href} onClick={close}>
                        <Icon />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {n > 0 && <SidebarMenuBadge className="top-2 text-[11px] tabular-nums peer-data-[active=true]/menu-button:text-sidebar-accent-foreground">{n}</SidebarMenuBadge>}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-xl border bg-background p-2.5 text-left shadow-xs outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50">
            <Avatar name={user.name} />
            <div className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate text-[13px] font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <UserMenuContent user={user} onPick={close} side={isMobile ? "top" : "right"} />
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
