import "server-only";
import { redirect } from "next/navigation";
import { withParams, type Params } from "./url";

/**
 * A page past the end, for example after every lead on the last page was assigned, goes to the last page
 * that has rows instead of showing an empty list that reads as "nothing here".
 */
export function clampPage(page: number, total: number, size: number, params: Params, path: string, keep: Params = {}): void {
  const last = Math.max(1, Math.ceil(total / size));
  if (page > last) redirect(withParams(params, { ...keep, page: last > 1 ? String(last) : undefined }, path));
}
