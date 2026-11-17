export type Params = Record<string, string | undefined>;

/** Build "/?a=1&b=2" from current params plus changes; empty values are dropped. */
export function withParams(current: Params, changes: Params, path = "/"): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...changes })) if (v) next.set(k, v);
  const qs = next.toString();
  return qs ? `${path}?${qs}` : path;
}

export function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}
