"use client";

import Link from "next/link";
import { ArrowUpRight, Eye, History, Mail, MoreHorizontal, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LinkedInIcon } from "./icons";

function tel(n: string) {
  const digits = n.replace(/[^+\d]/g, "").replace(/^00/, "+");
  return /^\+?\d{7,15}$/.test(digits) ? `tel:${digits}` : null;
}
function gmail(email: string) {
  return `https://mail.google.com/mail/?${new URLSearchParams({ view: "cm", fs: "1", to: email })}`;
}
function web(url: string) {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.protocol.startsWith("http") ? u.href : null;
  } catch {
    return null;
  }
}

/** The reference's action column: call, email, and a "…" menu. */
export function RowActions({ name, detailsHref, leadId, phone, email, linkedin }: {
  name: string; detailsHref: string; leadId: number; phone?: string; email?: string; linkedin?: string;
}) {
  const call = phone ? tel(phone) : null;
  const li = linkedin ? web(linkedin) : null;
  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="outline" size="icon-xs" asChild={!!call} disabled={!call} aria-label={call ? `Call ${name}` : "No phone number"} title={call ? `Call ${phone}` : "No phone number"}>
        {call ? <a href={call}><Phone /></a> : <Phone />}
      </Button>
      <Button variant="outline" size="icon-xs" asChild={!!email} disabled={!email} aria-label={email ? `Email ${name} in Gmail` : "No email"} title={email ? `Email ${email}` : "No email"}>
        {email ? <a href={gmail(email)} target="_blank" rel="noopener noreferrer"><Mail /></a> : <Mail />}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-xs" aria-label={`More actions for ${name}`}><MoreHorizontal /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Menu</DropdownMenuLabel>
          <DropdownMenuItem asChild><Link href={detailsHref} scroll={false}><Eye /> Details</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link href={`/calls?for=${leadId}`}><History /> Call history</Link></DropdownMenuItem>
          {li && <DropdownMenuItem asChild><a href={li} target="_blank" rel="noopener noreferrer"><LinkedInIcon className="size-4" /> LinkedIn profile</a></DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** The "…" on a stat card: a single real action. */
export function CardMenu({ href, label }: { href: string; label: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" className="ml-auto text-muted-foreground" aria-label="Card menu"><MoreHorizontal /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild><Link href={href}><ArrowUpRight /> {label}</Link></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
