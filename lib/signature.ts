/**
 * The default email signature: the DX logo and wordmark on the left, a rule, then the sender's name in capitals,
 * their title and one row per contact detail with a round brand-green icon (the user's reference layout, in DealWorkx
 * ink and green). Email-safe: tables, inline styles, PNG images on a public URL. Empty details are left out.
 * Shared by the composer preview, the signature settings page (live preview) and the server that sends.
 */

export type SignatureData = {
  name: string;
  title: string;
  phone: string;
  email: string;
  company: string;
  website: string;
  address: string;
};

const INK = "#14181a";
const MUTED = "#4b5652";
const GREEN = "#0f5a48";

/**
 * The brand typeface (Inter Tight, as on dealworkx.com) first. Mail apps that load web fonts (Apple Mail, iOS,
 * Outlook for Mac) use it; Gmail and Outlook for Windows can't load fonts, so they fall to the closest installed
 * face (Segoe UI on Windows, Helvetica Neue on Mac) rather than Arial. In the app, --font-sig is Inter Tight.
 */
const EMAIL_FONT = "'Inter Tight',Inter,'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif";
const APP_FONT = `var(--font-sig),${EMAIL_FONT}`;
/** Web-font stylesheet for the <head> of a sent email (ignored by clients that can't use it). */
export const SIGNATURE_FONT_LINK = '<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;700&display=swap" rel="stylesheet">';

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function websiteHref(site: string): string {
  return /^https?:\/\//i.test(site) ? site : `https://${site}`;
}
function websiteLabel(site: string): string {
  return site.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

/** `assets` is where /email/*.png is served: "" inside the app, the public app URL in a sent email. */
export function signatureHtml(d: SignatureData, assets: string): string {
  const img = (file: string) => `${assets.replace(/\/+$/, "")}/email/${file}`;
  const font = assets ? EMAIL_FONT : APP_FONT;
  // The DealWorkx lockup (mark + wordmark set in Inter Tight) is one image, so it matches the logo in every inbox.
  const brandLockup = !d.company.trim() || d.company.trim().toLowerCase() === "dealworkx";
  const rows: [string, string][] = [];
  if (d.phone.trim()) rows.push(["phone.png", `<a href="tel:${esc(d.phone.replace(/[^+\d]/g, ""))}" style="color:${INK};text-decoration:none">${esc(d.phone.trim())}</a>`]);
  if (d.email.trim()) rows.push(["mail.png", `<a href="mailto:${esc(d.email.trim())}" style="color:${INK};text-decoration:none">${esc(d.email.trim())}</a>`]);
  if (d.website.trim()) rows.push(["globe.png", `<a href="${esc(websiteHref(d.website.trim()))}" style="color:${INK};text-decoration:none">${esc(websiteLabel(d.website.trim()))}</a>`]);
  if (d.address.trim()) rows.push(["pin.png", esc(d.address.trim())]);

  const contact = rows
    .map(([icon, html]) =>
      `<tr><td style="padding:3px 10px 3px 0;vertical-align:middle;width:22px"><img src="${img(icon)}" width="22" height="22" alt="" style="display:block;border:0;width:22px;height:22px;min-width:22px;max-width:none"></td>` +
      `<td style="padding:3px 0;vertical-align:middle;font-family:${font};font-size:13px;line-height:18px;color:${INK}">${html}</td></tr>`)
    .join("");

  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:${font};color:${INK}">` +
    `<tr>` +
    `<td style="padding:4px 22px 4px 0;vertical-align:middle;text-align:center">` +
    (brandLockup
      ? `<img src="${img("logo-wordmark.png")}" width="100" height="97" alt="DealWorkx" style="display:block;border:0;width:100px;height:97px;min-width:100px;max-width:none;margin:0 auto">`
      : `<img src="${img("logo.png")}" width="74" height="58" alt="${esc(d.company)}" style="display:block;border:0;width:74px;height:58px;min-width:74px;max-width:none;margin:0 auto">` +
        `<div style="margin-top:8px;font-family:${font};font-size:16px;line-height:18px;font-weight:600;letter-spacing:-0.3px;color:${INK}">${esc(d.company.trim())}</div>`) +
    `</td>` +
    `<td style="width:2px;background:${GREEN};font-size:0;line-height:0">&nbsp;</td>` +
    `<td style="padding:4px 0 4px 22px;vertical-align:middle">` +
    `<div style="font-family:${font};font-size:20px;line-height:24px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${INK}">${esc(d.name.trim())}</div>` +
    (d.title.trim() ? `<div style="margin-top:3px;font-family:${font};font-size:13px;line-height:18px;font-weight:500;color:${MUTED}">${esc(d.title.trim())}</div>` : "") +
    (contact ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:10px">${contact}</table>` : "") +
    `</td>` +
    `</tr></table>`
  );
}

/** The plain-text version for the text part of the email. */
export function signatureText(d: SignatureData): string {
  return ["--", d.name, d.title, d.company, d.phone, d.email, d.website && websiteLabel(d.website), d.address]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join("\n");
}
