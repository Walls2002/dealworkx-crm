/** Industries arrive lowercase from the source sheet ("information technology & services"); show them title-cased. */
export function industryLabel(industry: string): string {
  return industry.replace(/(^|[\s/(-])(\p{Ll})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}
