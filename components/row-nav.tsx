"use client";

import { useRouter } from "next/navigation";
import { TableBody } from "@/components/ui/table";

/** A tbody whose rows open their primary link (the one marked data-primary) when clicked anywhere. */
export function RowNav({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <TableBody
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("a, button, input, label, select")) return;
        const href = target.closest("tr")?.querySelector<HTMLAnchorElement>("a[data-primary]")?.getAttribute("href");
        if (href) router.push(href, { scroll: false });
      }}
    >
      {children}
    </TableBody>
  );
}
