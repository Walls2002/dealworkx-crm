import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import type { Db } from "./db";
import { brevoConfigured, publicAppUrl, sendBrevoEmail, senderDomain } from "./brevo";

/** Invites last a week; password-reset links an hour. */
export const TOKEN_TTL = { invite: 7 * 24 * 3_600_000, reset: 3_600_000 } as const;
export type TokenPurpose = keyof typeof TOKEN_TTL;

export const MIN_PASSWORD = 8;

/** Why a new password isn't acceptable, or null. */
export function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (password.length > 200) return "That password is too long. Use 200 characters or fewer.";
  if (password !== confirm) return "The two passwords don't match.";
  return null;
}

const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

/** A new single-use link token. Only its hash is stored, so a database leak can't be used to sign in. */
export async function createToken(d: Db, userId: number, purpose: TokenPurpose): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  // A new link replaces any older unused one for the same purpose.
  await d.query("update auth_tokens set used_at = now() where user_id = $1 and purpose = $2 and used_at is null", [userId, purpose]);
  await d.query("insert into auth_tokens (token_hash, user_id, purpose, expires_at) values ($1, $2, $3, $4)", [
    hashToken(raw), userId, purpose, new Date(Date.now() + TOKEN_TTL[purpose]),
  ]);
  return raw;
}

export type TokenInfo = { userId: number; purpose: TokenPurpose; name: string; email: string };

/** The account behind a link, if the link is still valid. `consume` marks it used (inside a transaction). */
export async function readToken(d: Db, raw: string, consume = false): Promise<TokenInfo | null> {
  if (!raw || raw.length > 100) return null;
  const [row] = await d.query<{ user_id: number; purpose: TokenPurpose; name: string; email: string }>(
    `select t.user_id, t.purpose, u.name, u.email from auth_tokens t join users u on u.id = t.user_id
      where t.token_hash = $1 and t.used_at is null and t.expires_at > now() ${consume ? "for update of t" : ""}`,
    [hashToken(raw)],
  );
  if (!row) return null;
  if (consume) await d.query("update auth_tokens set used_at = now() where token_hash = $1", [hashToken(raw)]);
  return { userId: Number(row.user_id), purpose: row.purpose, name: row.name, email: row.email };
}

/** The address people reach this CRM at: the request's own host, so links work in dev and production alike. */
export async function appOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return publicAppUrl();
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

export function linkFor(origin: string, raw: string): string {
  return `${origin}/set-password?token=${encodeURIComponent(raw)}`;
}

export function onTeamDomain(email: string): boolean {
  return email.split("@")[1]?.toLowerCase() === senderDomain();
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A plain, branded account email: heading, a short paragraph, one button, and the link spelled out underneath. */
function accountEmail({ heading, intro, button, url, footnote }: { heading: string; intro: string; button: string; url: string; footnote: string }) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;background:#f4f4f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#111827">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="width:100%;max-width:520px;background:#ffffff;border-radius:12px;border-collapse:separate">
<tr><td style="padding:32px 32px 8px"><img src="${publicAppUrl()}/email/logo-wordmark.png" width="64" height="62" alt="DealWorkx" style="display:block;border:0"></td></tr>
<tr><td style="padding:16px 32px 0;font-size:22px;line-height:28px;font-weight:700">${esc(heading)}</td></tr>
<tr><td style="padding:12px 32px 0;font-size:15px;line-height:23px;color:#374151">${esc(intro)}</td></tr>
<tr><td style="padding:24px 32px 0"><a href="${esc(url)}" style="display:inline-block;background:#FECE14;color:#000000;font-weight:700;font-size:15px;text-decoration:none;padding:13px 22px;border-radius:10px">${esc(button)}</a></td></tr>
<tr><td style="padding:24px 32px 0;font-size:13px;line-height:20px;color:#4b5563">Or paste this link into your browser:<br><a href="${esc(url)}" style="color:#111827;word-break:break-all">${esc(url)}</a></td></tr>
<tr><td style="padding:20px 32px 32px;font-size:13px;line-height:20px;color:#6b7280">${esc(footnote)}</td></tr>
</table></body></html>`;
  const text = `${heading}\n\n${intro}\n\n${button}: ${url}\n\n${footnote}`;
  return { html, text };
}

/** Account emails come from the CRM itself, not a person. */
function systemSender() {
  return { name: "DealWorkx CRM", email: process.env.CRM_EMAIL_FROM?.trim() || `no-reply@${senderDomain()}` };
}

export async function sendInviteEmail(to: { name: string; email: string }, invitedBy: string, url: string): Promise<void> {
  const { html, text } = accountEmail({
    heading: "You're invited to DealWorkx CRM",
    intro: `${invitedBy} added you to the DealWorkx CRM. Set a password to sign in and see your leads, outreach steps and calls.`,
    button: "Set your password",
    url,
    footnote: "This link works once and expires in 7 days. If you weren't expecting it, you can ignore this email.",
  });
  await sendBrevoEmail({ from: systemSender(), to, subject: "Your DealWorkx CRM invite", html, text });
}

export async function sendResetEmail(to: { name: string; email: string }, url: string): Promise<void> {
  const { html, text } = accountEmail({
    heading: "Reset your password",
    intro: `Someone asked to reset the password for ${to.email}. Choose a new one with the button below.`,
    button: "Choose a new password",
    url,
    footnote: "This link works once and expires in 1 hour. If you didn't ask for it, ignore this email: your password stays the same.",
  });
  await sendBrevoEmail({ from: systemSender(), to, subject: "Reset your DealWorkx CRM password", html, text });
}

export { brevoConfigured };
