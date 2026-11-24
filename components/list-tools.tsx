"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

/** Write filter changes to the current page's URL (dropping page and the open lead). */
export function useUrlFilter() {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [, start] = useTransition();
  return (changes: Record<string, string>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(changes)) v ? next.set(k, v) : next.delete(k);
    next.delete("page");
    next.delete("lead");
    const qs = next.toString();
    start(() => router.replace(qs ? `${path}?${qs}` : path, { scroll: false }));
  };
}

/** Search as you type, after a short pause; only when the text really changed. */
export function SearchBox({ q, placeholder }: { q: string; placeholder: string }) {
  const go = useUrlFilter();
  const [text, setText] = useState(q);
  const last = useRef(q.trim());
  useEffect(() => {
    const term = text.trim();
    if (term === last.current) return;
    const t = setTimeout(() => { last.current = term; go({ q: term }); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return (
    <div className="relative w-full sm:w-72" role="search">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input type="search" aria-label="Search" placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} className="h-8 pl-8 text-[13px]" />
    </div>
  );
}

export type FilterOption = { value: string; label: string };

/** A filter dropdown that reads like the reference's outline buttons. */
export function FilterSelect({ name, label, value, any, options, clears = [] }: { name: string; label: string; value: string; any: string; options: FilterOption[]; /** Other params to drop when this one changes. */ clears?: string[] }) {
  const go = useUrlFilter();
  return (
    // Capped so one long option (an industry name) can't stretch the toolbar; the open list still shows it in full.
    <NativeSelect size="sm" aria-label={label} value={value} onChange={(e) => go({ ...Object.fromEntries(clears.map((k) => [k, ""])), [name]: e.target.value })} className="h-8 max-w-52 [&_select]:h-8 [&_select]:w-full [&_select]:truncate [&_select]:text-[13px]">
      <NativeSelectOption value="">{any}</NativeSelectOption>
      {options.map((o) => <NativeSelectOption key={o.value} value={o.value}>{o.label}</NativeSelectOption>)}
    </NativeSelect>
  );
}
