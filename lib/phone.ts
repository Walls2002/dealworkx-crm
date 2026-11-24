/**
 * Phone numbers from the lead sheets often carry an extension: "+1 800-678-5782 ext 115", sometimes "…8574--108".
 * Stripping every non-digit glued the extension onto the number ("+18006785782115"), so the dialer rang a wrong,
 * mixed-up number. Split the extension off first: the dialer gets the main number, the rep sees "ext 115" to key in.
 */
const EXTENSION = /\s*(?:ext\.?|extension|x|#|--)\s*(\d{1,6})\s*$/i;

export function splitPhone(raw: string): { main: string; ext: string | null } {
  const value = raw.trim();
  const m = value.match(EXTENSION);
  return m ? { main: value.slice(0, m.index).trim(), ext: m[1] } : { main: value, ext: null };
}

/** A tel: link for the main number only, or null when it isn't a dialable number. */
export function telHref(raw: string): string | null {
  const digits = splitPhone(raw).main.replace(/[^+\d]/g, "").replace(/^00/, "+");
  return /^\+?\d{7,15}$/.test(digits) ? `tel:${digits}` : null;
}
