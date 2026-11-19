import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * The DealWorkx DX mark, redrawn as a vector from the brand logo for light interfaces:
 * the split D in ink, the X as a green blade crossing a green band. No glow, no dark tile.
 */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 92 72" className={cn("shrink-0", className)} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <defs>
        <linearGradient id={`blade-${id}`} x1="86" y1="4" x2="47" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5fd38b" />
          <stop offset="1" stopColor="#1f8f4e" />
        </linearGradient>
        <linearGradient id={`band-${id}`} x1="50" y1="40" x2="86" y2="68" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1c7f45" />
          <stop offset="1" stopColor="#3cb46b" />
        </linearGradient>
      </defs>
      {/* D: upper bowl with the slanted top bar */}
      <path d="M4.5 6.5H33C46 6.5 55 13 58.8 24.5L49.6 33.4C47.5 22.5 41 15.5 32 15.5H11Z" className="fill-foreground" />
      {/* D: stem, bottom bar and lower bowl */}
      <path d="M7 22.5H18.2V55.5H31C36.5 55.5 40.5 50 43 42.5L50.6 49.2C46 60 38.5 65.5 31 65.5H7Z" className="fill-foreground" />
      {/* X: the band running down to the right, then the blade rising to the top right */}
      <path d="M47 40L61 37.5L87 68H70Z" fill={`url(#band-${id})`} />
      <path d="M86 4.5L61 37.5L47 40Z" fill={`url(#blade-${id})`} />
    </svg>
  );
}

/** Mark plus the name, set as a plain product wordmark: one line, semibold, slightly tight. */
export function Logo({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <span className={cn("inline-flex items-center", size === "lg" ? "gap-3" : "gap-2.5", className)}>
      <LogoMark className={size === "lg" ? "h-10 w-[51px]" : "h-8 w-[41px]"} />
      <span className={cn("leading-none font-semibold tracking-[-0.02em] text-foreground", size === "lg" ? "text-2xl" : "text-[21px]")}>
        DealWorkx <span className="font-normal text-muted-foreground">CRM</span>
      </span>
    </span>
  );
}
