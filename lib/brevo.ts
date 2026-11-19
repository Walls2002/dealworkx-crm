import "server-only";

/**
 * Sending email through Brevo's transactional API, from the signed-in user's own address.
 * The sending domain is authenticated in Brevo, so any address on it can be the sender.
 *
 * BREVO_API_KEY        the API key (Brevo → SMTP & API → API keys). No key, no "Send from CRM" button.
 * BREVO_SENDER_DOMAIN  the authenticated domain; users whose email is on another domain can't send. Default dealworkx.com.
 */

export function senderDomain(): string {
  return (process.env.BREVO_SENDER_DOMAIN || "dealworkx.com").trim().toLowerCase().replace(/^@/, "");
}

export function brevoConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY?.trim());
}

/**
 * Where recipients' mail apps load the signature images (/email/*.png): the CRM's public address.
 * APP_URL overrides it; until the CRM is live there, the images show as blank boxes in received mail.
 */
export function publicAppUrl(): string {
  return (process.env.APP_URL || "https://crm.dealworkx.com").trim().replace(/\/+$/, "");
}

/** Why this user can't send from the CRM, or null when they can. */
export function senderProblem(email: string): string | null {
  if (!brevoConfigured()) return "Email sending isn't set up yet. An admin needs to add the Brevo API key.";
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (domain !== senderDomain()) return `Your account email (${email}) isn't on ${senderDomain()}, so Brevo can't send as you.`;
  return null;
}

export type OutgoingEmail = {
  from: { name: string; email: string };
  to: { name: string; email: string };
  subject: string;
  /** The finished HTML (message + signature) and its plain-text version. */
  html: string;
  text: string;
};

/** Send one email. Returns Brevo's message ID; throws an Error with a message fit to show the user. */
export async function sendBrevoEmail(mail: OutgoingEmail): Promise<string> {
  const key = process.env.BREVO_API_KEY?.trim();
  if (!key) throw new Error("Email sending isn't set up yet. An admin needs to add the Brevo API key.");
  let res: Response;
  try {
    res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", "api-key": key },
      body: JSON.stringify({
        sender: mail.from,
        to: [mail.to.name ? mail.to : { email: mail.to.email }],
        replyTo: mail.from,
        subject: mail.subject,
        textContent: mail.text,
        htmlContent: mail.html,
        tags: ["crm"],
        // BREVO_SANDBOX=1: Brevo validates the request and returns a message ID but delivers nothing (for testing).
        ...(process.env.BREVO_SANDBOX === "1" ? { headers: { "X-Sib-Sandbox": "drop" } } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error("Couldn't reach Brevo. Check the connection and try again. Nothing was sent.");
  }
  const data = (await res.json().catch(() => ({}))) as { messageId?: string; message?: string; code?: string };
  if (res.ok) return data.messageId ?? "";
  const detail = data.message ?? "";
  if (res.status === 401 && /ip/i.test(detail)) {
    throw new Error("Brevo blocked this server's IP address. In Brevo, open Security → Authorised IPs and add the server's IP (or turn the IP check off).");
  }
  if (res.status === 401) throw new Error("Brevo rejected the API key. An admin needs to check BREVO_API_KEY.");
  if (/sender/i.test(detail)) throw new Error(`Brevo won't send from ${mail.from.email}: ${detail.replace(/\.?$/, ".")}`);
  if (/not valid in to/i.test(detail)) throw new Error(`Brevo says ${mail.to.email} isn't a valid email address. Nothing was sent.`);
  throw new Error(`Brevo couldn't send the email${detail ? `: ${detail.replace(/\.?$/, ".")}` : "."} Nothing was sent.`);
}
