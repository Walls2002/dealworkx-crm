import type { Db } from "./db";

/**
 * Duplicate rules for lead uploads.
 * Definite (skipped automatically): same email, same contact ID, or same LinkedIn profile.
 * Possible (an admin decides): same name + company, or the same personal phone (work direct, mobile, home).
 * Company and corporate phones are shared by colleagues, so they never count.
 */

const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function emailKey(email: string): string {
  return email.trim().toLowerCase();
}

/** "https://www.linkedin.com/in/jane-doe/?x=1" → "linkedin.com/in/jane-doe"; "" when it isn't a profile URL. */
export function linkedinKey(url: string): string {
  const u = url.trim().toLowerCase().split("?")[0].replace(/^https?:\/\//, "").replace(/^(www\.|[a-z]{2}\.)/, "").replace(/\/+$/, "");
  return u.includes("linkedin.com/in/") ? u : "";
}

export function nameKey(first: string, last: string, company: string): string {
  const f = clean(first), l = clean(last), c = clean(company);
  return (f || l) && c ? `${f}|${l}@${c}` : "";
}

/** Last 10 digits, so "+1 (415) 555-0101" and "415.555.0101" match. */
export function phoneKey(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.length >= 7 ? d.slice(-10) : "";
}

export type Candidate = {
  email: string; contactId: string; linkedin: string;
  first: string; last: string; company: string; phones: string[];
};

export type Match = { kind: "definite" | "possible"; reason: string; with: string };

type Seen = { label: string };

/** An index of everything already known (the CRM, then each accepted upload row), checked row by row. */
export class DuplicateIndex {
  private email = new Map<string, Seen>();
  private contact = new Map<string, Seen>();
  private linkedin = new Map<string, Seen>();
  private name = new Map<string, Seen>();
  private phone = new Map<string, Seen>();

  add(c: Candidate, label: string) {
    const seen = { label };
    const put = (m: Map<string, Seen>, k: string) => { if (k && !m.has(k)) m.set(k, seen); };
    put(this.email, emailKey(c.email));
    put(this.contact, c.contactId.trim());
    put(this.linkedin, linkedinKey(c.linkedin));
    put(this.name, nameKey(c.first, c.last, c.company));
    for (const p of c.phones) put(this.phone, phoneKey(p));
  }

  check(c: Candidate): Match | null {
    const hit = (m: Map<string, Seen>, k: string) => (k ? m.get(k) : undefined);
    let s: Seen | undefined;
    if ((s = hit(this.email, emailKey(c.email)))) return { kind: "definite", reason: "Same email", with: s.label };
    if ((s = hit(this.contact, c.contactId.trim()))) return { kind: "definite", reason: "Same contact ID", with: s.label };
    if ((s = hit(this.linkedin, linkedinKey(c.linkedin)))) return { kind: "definite", reason: "Same LinkedIn profile", with: s.label };
    if ((s = hit(this.name, nameKey(c.first, c.last, c.company)))) return { kind: "possible", reason: "Same name and company", with: s.label };
    for (const p of c.phones) if ((s = hit(this.phone, phoneKey(p)))) return { kind: "possible", reason: "Same phone number", with: s.label };
    return null;
  }

  /** Load every lead already in the CRM. Labels read like "Jane Doe <jane@x.com> (in CRM)". */
  static async fromDb(d: Db): Promise<DuplicateIndex> {
    const index = new DuplicateIndex();
    const rows = await d.query<Record<string, string>>(
      `select first_name, last_name, company, email, contact_id, linkedin_url, phone_work, phone_mobile, phone_home from leads`,
    );
    for (const r of rows) {
      const who = `${r.first_name} ${r.last_name}`.trim() || "(No name)";
      index.add(
        { email: r.email, contactId: r.contact_id, linkedin: r.linkedin_url, first: r.first_name, last: r.last_name, company: r.company, phones: [r.phone_work, r.phone_mobile, r.phone_home] },
        `${who}${r.email ? ` <${r.email}>` : ""} (already in the CRM)`,
      );
    }
    return index;
  }
}

/** Email verification from the export's Email Status column. */
export type EmailCheck = "verified" | "unverified" | "invalid";
export function emailCheck(status: string, email: string): EmailCheck {
  const s = status.trim().toLowerCase();
  if (!email) return "unverified";
  if (s === "invalid" || s === "bounced") return "invalid";
  if (s === "verified" || s === "valid") return "verified";
  return "unverified";
}
