"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

/** Rows per page: writes ?size= and goes back to page 1. */
export function PageSizeSelect({ size, sizes, param = "size", pageParam = "page" }: { size: number; sizes: readonly number[]; param?: string; pageParam?: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      Rows per page
      <NativeSelect
        size="sm"
        aria-label="Rows per page"
        value={String(size)}
        disabled={pending}
        onChange={(e) => {
          const next = new URLSearchParams(sp.toString());
          next.set(param, e.target.value);
          next.delete(pageParam);
          next.delete("lead");
          start(() => router.replace(`${path}?${next}`, { scroll: false }));
        }}
      >
        {sizes.map((n) => <NativeSelectOption key={n} value={n}>{n}</NativeSelectOption>)}
      </NativeSelect>
    </label>
  );
}
