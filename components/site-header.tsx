"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, RotateCw, Search, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { isActive, TABS, UserMenuContent, type ShellUser } from "./app-sidebar";
import { Avatar } from "./avatar";

const OTHER: Record<string, string> = { "/sequence": "Sequence", "/import": "Upload leads", "/duplicates": "Duplicates", "/signature": "Email signature" };

export function SiteHeader({ user, demo }: { user: ShellUser; demo: boolean }) {
  const path = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(path === "/" && sp.get("view") === "all" ? sp.get("q") ?? "" : "");
  const [spinning, setSpinning] = useState(false);
  const title = TABS.find((t) => isActive(path, t.href))?.label ?? OTHER[path] ?? "DealWorkx";

  // Ctrl/⌘K focuses the search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 lg:px-6">
      <SidebarTrigger className="-ml-1 md:hidden" />
      <h1 className="truncate text-[15px] font-semibold">{title}</h1>
      <div className="ml-auto flex items-center gap-2">
        {demo && <Badge variant="secondary" className="hidden font-normal text-muted-foreground lg:inline-flex">Demo data</Badge>}
        <form
          role="search"
          className="relative hidden md:block"
          onSubmit={(e) => {
            e.preventDefault();
            const term = q.trim();
            router.push(term ? `/?view=all&q=${encodeURIComponent(term)}` : "/?view=all");
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input ref={input} type="search" aria-label="Search all leads" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-56 pl-8 text-[13px]" />
          <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border bg-muted px-1.5 text-[10px] text-muted-foreground">Ctrl K</kbd>
        </form>
        {user.admin && path !== "/import" && (
          <Button size="sm" className="h-8" asChild>
            <Link href="/import"><Upload /> <span className="hidden sm:inline">Upload leads</span></Link>
          </Button>
        )}
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Refresh"
          title="Refresh"
          onClick={() => {
            setSpinning(true);
            router.refresh();
            setTimeout(() => setSpinning(false), 700);
          }}
        >
          <RotateCw className={spinning ? "animate-spin" : undefined} />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-full py-0.5 pr-2 pl-0.5 text-[13px] font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
            <Avatar name={user.name} size="sm" />
            <span className="hidden sm:inline">{user.name}</span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <UserMenuContent user={user} />
        </DropdownMenu>
      </div>
    </header>
  );
}
