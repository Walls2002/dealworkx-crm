"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/** A password field with a show/hide toggle. `inputClassName` styles the field (the auth pages use their own theme). */
export function PasswordInput({ className, inputClassName, toggleClassName, ...props }: React.ComponentProps<"input"> & { inputClassName?: string; toggleClassName?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className={cn("relative", className)}>
      <Input {...props} type={shown ? "text" : "password"} className={cn("pr-10", inputClassName)} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        className={cn(
          "absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60",
          toggleClassName,
        )}
      >
        {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
