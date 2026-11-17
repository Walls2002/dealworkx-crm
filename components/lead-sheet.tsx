"use client";

import { useRouter } from "next/navigation";
import { Sheet, SheetContent } from "@/components/ui/sheet";

/** The lead record as a right-hand sheet. The URL (?lead=) owns open state; closing navigates back to the list. */
export function LeadSheet({ closeHref, children }: { closeHref: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <Sheet open onOpenChange={(open) => { if (!open) router.push(closeHref, { scroll: false }); }}>
      <SheetContent showCloseButton={false} className="w-full gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        {children}
      </SheetContent>
    </Sheet>
  );
}
