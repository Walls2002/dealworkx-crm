"use client";

import { useRouter } from "next/navigation";
import { Sheet, SheetContent } from "@/components/ui/sheet";

/** The lead record as a right-hand sheet. The URL (?lead=) owns open state; closing navigates back to the list. */
export function LeadSheet({ closeHref, children }: { closeHref: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <Sheet open onOpenChange={(open) => { if (!open) router.push(closeHref, { scroll: false }); }}>
      {/* Phones and tablets: one scrolling column. lg and up: wide, and each column scrolls on its own (see LeadPanel). */}
      <SheetContent
        showCloseButton={false}
        // Focus the panel itself on open, not its first button, so no focus ring lands on a random control.
        onOpenAutoFocus={(e) => { e.preventDefault(); (e.target as HTMLElement | null)?.focus?.(); }}
        className="w-full gap-0 overflow-y-auto p-0 outline-none [scrollbar-width:thin] data-[side=right]:w-full data-[side=right]:sm:max-w-2xl data-[side=right]:lg:max-w-[min(68rem,calc(100vw-12rem))] lg:overflow-hidden"
      >
        {children}
      </SheetContent>
    </Sheet>
  );
}
