"use client";

import { startTransition, useActionState } from "react";
import { ListX, RotateCcw } from "lucide-react";
import { removeLeads, restoreLeads, type FormState } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "./toast";

type Props = {
  ids: number[];
  mode: "remove" | "restore";
  /** "button": icon + text; "icon": a small icon button for table rows. */
  look?: "button" | "icon";
  /** Who or what is affected, for the confirmation: a lead's name, or "3 leads". */
  what: string;
  onDone?: () => void;
  className?: string;
};

/**
 * Remove leads from the list (or restore them), after a confirmation: the trigger opens a small menu that says what
 * will happen, with the destructive choice and Cancel. Used in the lead panel header, on table rows and in the bulk bar.
 */
export function RemoveLeads({ ids, mode, look = "button", what, onDone, className }: Props) {
  // The toast fires from the action itself: the row (and this button) is gone once the list refreshes.
  const [, run, pending] = useActionState<FormState, FormData>(async (prev, fd) => {
    const result = await (mode === "remove" ? removeLeads : restoreLeads)(prev, fd);
    if (result?.ok) { toast(result.ok); onDone?.(); }
    if (result?.error) toast(result.error);
    return result;
  }, null);

  const go = () => {
    const fd = new FormData();
    ids.forEach((id) => fd.append("ids", String(id)));
    startTransition(() => run(fd));
  };
  const Icon = mode === "remove" ? ListX : RotateCcw;
  const label = mode === "remove" ? "Remove from list" : "Restore to list";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {look === "icon" ? (
          <Button variant="outline" size="icon-xs" disabled={pending} aria-label={`${label}: ${what}`} title={label} className={className}>
            <Icon />
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled={pending} className={className}>
            <Icon /> <span className="max-sm:sr-only">{pending ? (mode === "remove" ? "Removing…" : "Restoring…") : label}</span>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="grid gap-1 font-normal">
          <span className="font-medium text-foreground">{mode === "remove" ? `Remove ${what} from the list?` : `Restore ${what} to the list?`}</span>
          <span className="text-xs text-muted-foreground">
            {mode === "remove"
              ? "It leaves every list and its sequence stops: steps not yet sent are cancelled and any callback is cleared. Calls, comments and emails are kept, and you can restore it from Removed leads."
              : "It goes back to its list. If it is assigned and Active, the steps it hadn't sent are rescheduled from today."}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant={mode === "remove" ? "destructive" : "default"} onSelect={go}>
          <Icon /> {mode === "remove" ? `Yes, remove ${ids.length === 1 ? "it" : "them"}` : `Yes, restore ${ids.length === 1 ? "it" : "them"}`}
        </DropdownMenuItem>
        <DropdownMenuItem>Cancel</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
