/** RFC 4180 CSV: quoted fields, escaped quotes, commas and newlines inside quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}

/**
 * The lead upload template: the 65 columns of the team's lead exports, in the order the old PROSPECT LIST used (A to BM).
 * Uploads are matched by header name, so column order and extra columns (e.g. "Sub Departments") don't matter.
 */
export const TEMPLATE_HEADERS = [
  "First Name", "Last Name", "Title", "Company Name", "Company Name for Emails", "Email", "Email Status",
  "Primary Email Source", "Primary Email Verification Source", "Email Confidence", "Primary Email Catch-all Status",
  "Primary Email Last Verified At", "Seniority", "Departments", "Contact Owner", "Work Direct Phone", "Home Phone",
  "Mobile Phone", "Corporate Phone", "Other Phone", "Stage", "Lists", "Last Contacted", "Account Owner", "# Employees",
  "Industry", "Keywords", "Person Linkedin Url", "Website", "Company Linkedin Url", "Facebook Url", "Twitter Url", "City",
  "State", "Country", "Company Address", "Company City", "Company State", "Company Country", "Company Phone",
  "Technologies", "Annual Revenue", "Total Funding", "Latest Funding", "Latest Funding Amount", "Last Raised At",
  "Subsidiary of", "Email Sent", "Email Open", "Email Bounced", "Replied", "Demoed", "Number of Retail Locations",
  "Contact Id", "Account Id", "Secondary Email", "Secondary Email Source", "Secondary Email Status",
  "Secondary Email Verification Source", "Tertiary Email", "Tertiary Email Source", "Tertiary Email Status",
  "Tertiary Email Verification Source", "Tag", "Qualify Contact",
] as const;

/** A sheet must carry these to count as following the template. */
export const REQUIRED_HEADERS = ["First Name", "Last Name", "Title", "Company Name", "Email", "Country"] as const;

// Source files may prefix some columns with the export tool's name ("Apollo Contact Id"); match them without it.
export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^apollo(?=.)/, "");
/** A header as the CRM shows it: without the export tool's name. */
export const displayHeader = (h: string) => String(h).trim().replace(/^apollo\s+/i, "");

/** Lead columns and the template headers that fill them (first match wins). */
const COLUMNS = {
  first_name: ["First Name"],
  last_name: ["Last Name"],
  title: ["Title"],
  company: ["Company Name", "Company"],
  email: ["Email"],
  email_status: ["Email Status"],
  contact_id: ["Contact Id"],
  phone_work: ["Work Direct Phone"],
  phone_home: ["Home Phone"],
  phone_mobile: ["Mobile Phone"],
  phone_corporate: ["Corporate Phone"],
  phone_other: ["Other Phone"],
  phone_company: ["Company Phone"],
  linkedin_url: ["Person Linkedin Url", "Linkedin Url"],
  company_linkedin_url: ["Company Linkedin Url"],
  website: ["Website"],
  industry: ["Industry"],
  employees: ["# Employees", "Employees"],
  seniority: ["Seniority"],
  departments: ["Departments"],
  city: ["City"],
  state: ["State"],
  country: ["Country"],
  timezone: ["Timezone", "Time Zone"],
} as const;

export type ImportedLead = Record<keyof typeof COLUMNS, string> & { source_fields: [string, string][] };
export const LEAD_COLUMNS = Object.keys(COLUMNS) as (keyof typeof COLUMNS)[];

/** Map one sheet row to lead columns; every non-empty cell is also kept, in sheet order, for "View all fields". */
export function mapRow(header: string[], row: string[]): ImportedLead {
  const index = new Map(header.map((h, i) => [norm(h), i]));
  const out = {} as ImportedLead;
  for (const [column, names] of Object.entries(COLUMNS)) {
    const i = names.map((n) => index.get(norm(n))).find((v) => v !== undefined);
    out[column as keyof typeof COLUMNS] = i === undefined ? "" : String(row[i] ?? "").trim().slice(0, 500);
  }
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) out.email = "";
  out.source_fields = header
    .map((h, i) => [displayHeader(h), String(row[i] ?? "").trim().slice(0, 2000)] as [string, string])
    .filter(([h, v]) => h && v);
  return out;
}

/** How a sheet's header row compares with the template. */
export function checkHeader(header: string[]) {
  const have = new Set(header.map(norm));
  const known = new Set(TEMPLATE_HEADERS.map(norm));
  return {
    missingRequired: REQUIRED_HEADERS.filter((h) => !have.has(norm(h))),
    matched: TEMPLATE_HEADERS.filter((h) => have.has(norm(h))).length,
    extra: header.filter((h) => h.trim() && !known.has(norm(h))).map(displayHeader),
  };
}
