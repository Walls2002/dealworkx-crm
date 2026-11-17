import { Avatar as UIAvatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function initials(name: string): string {
  const parts = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "")).toUpperCase();
}

/** Initials avatar. */
export function Avatar({ name, size = "default", className }: { name: string; size?: "sm" | "default" | "lg"; className?: string }) {
  return (
    <UIAvatar size={size} className={className} aria-hidden>
      <AvatarFallback className={cn("text-xs font-medium", className?.includes("rounded-lg") && "rounded-lg")}>{initials(name)}</AvatarFallback>
    </UIAvatar>
  );
}
