import type { Db } from "./db";
import { splitPhone } from "./phone";

/**
 * Duplicate rules for lead uploads, checked in this order.
 *
 * 1. Same person (PersonIndex): compare four fields with a lead already in the CRM: email, mobile phone, other phone,
 *    and first + last name. A phone that is blank on both sides counts as matching. At least one real email or phone
 *    match is required, so two people who merely share a name and have no phones never match.
 *    - 3 or 4 match: "update". The upload replaces the old lead's sheet data (blank cells keep the old value).
 *    - 2 match: "possible". Flagged; the admin chooses skip, update the existing lead, or import as new.
 * 2. Otherwise the older rules:
 *    Definite (skipped automatically): same email, same contact ID, or same LinkedIn profile.
 *    Possible (an admin decides): same name + company, or the same personal phone (work direct, mobile, home).
 *    Company and corporate phones are shared by colleagues, so they never count.
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

/** Last 10 digits of the main number (extension dropped), so "+1 (415) 555-0101" and "415.555.0101 ext 12" match. */
export function phoneKey(phone: string): string {
  const d = splitPhone(phone).main.replace(/\D/g, "");
  return d.length >= 7 ? d.slice(-10) : "";
}

/** First + last name, ignoring case, spaces and punctuation. */
export function fullNameKey(first: string, last: string): string {
  const f = clean(first), l = clean(last);
  return f || l ? `${f}|${l}` : "";
}

export type Candidate = {
  email: string; contactId: string; linkedin: string;
  first: string; last: string; company: string; phones: string[];
  mobile: string; other: string;
};

export type Match = {
  kind: "definite" | "possible" | "update";
  reason: string;
  with: string;
  /** The CRM lead an "update" (or a 2-of-4 "possible") would change. */
  targetId?: number;
  /** A 2-of-4 match can be imported as a new lead only when nothing unique (email, contact ID, LinkedIn) collides. */
  canImportNew?: boolean;
};

/* ---------- 1. same person: 4-field comparison against the CRM ---------- */

export type Existing = { id: number; email: string; mobile: string; other: string; name: string; label: string };
export type PersonMatch = { lead: Existing; matched: string[]; total: number; real: number };

export class PersonIndex {
  private byEmail = new Map<string, Existing[]>();
  private byMobile = new Map<string, Existing[]>();
  private byOther = new Map<string, Existing[]>();
  private byName = new Map<string, Existing[]>();

  add(e: Existing) {
    const put = (m: Map<string, Existing[]>, k: string) => { if (k) (m.get(k) ?? m.set(k, []).get(k)!).push(e); };
    put(this.byEmail, e.email);
    put(this.byMobile, e.mobile);
    put(this.byOther, e.other);
    put(this.byName, e.name);
  }

  /** The CRM lead that shares the most of the four fields with this row, or null when none shares a real value. */
  best(c: Candidate): PersonMatch | null {
    const em = emailKey(c.email), mo = phoneKey(c.mobile), ot = phoneKey(c.other), nm = fullNameKey(c.first, c.last);
    const pool = new Set<Existing>([
      ...(em ? this.byEmail.get(em) ?? [] : []), ...(mo ? this.byMobile.get(mo) ?? [] : []),
      ...(ot ? this.byOther.get(ot) ?? [] : []), ...(nm ? this.byName.get(nm) ?? [] : []),
    ]);
    let top: PersonMatch | null = null;
    for (const e of pool) {
      const matched: string[] = [];
      let real = 0, blank = 0, name = 0;
      if (em && em === e.email) { real++; matched.push("email"); }
      if (mo && mo === e.mobile) { real++; matched.push("mobile phone"); } else if (!mo && !e.mobile) { blank++; matched.push("mobile phone (blank on both)"); }
      if (ot && ot === e.other) { real++; matched.push("other phone"); } else if (!ot && !e.other) { blank++; matched.push("other phone (blank on both)"); }
      if (nm && nm === e.name) { name++; matched.push("first + last name"); }
      // Shared name + blank phones alone is not the same person: a real email or phone match is required.
      if (real === 0) continue;
      const total = real + blank + name;
      if (!top || total > top.total || (total === top.total && real > top.real)) top = { lead: e, matched, total, real };
    }
    return top;
  }

  static async fromDb(d: Db): Promise<PersonIndex> {
    const index = new PersonIndex();
    const rows = await d.query<Record<string, string>>("select id, first_name, last_name, email, phone_mobile, phone_other from leads");
    for (const r of rows) {
      const who = `${r.first_name} ${r.last_name}`.trim() || "(No name)";
      index.add({
        id: Number(r.id), email: emailKey(r.email), mobile: phoneKey(r.phone_mobile), other: phoneKey(r.phone_other),
        name: fullNameKey(r.first_name, r.last_name), label: `${who}${r.email ? ` <${r.email}>` : ""} (already in the CRM)`,
      });
    }
    return index;
  }
}

/* ---------- 2. the older rules: CRM and earlier rows in the same file ---------- */

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
        {
          email: r.email, contactId: r.contact_id, linkedin: r.linkedin_url, first: r.first_name, last: r.last_name, company: r.company,
          phones: [r.phone_work, r.phone_mobile, r.phone_home], mobile: r.phone_mobile, other: "",
        },
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
