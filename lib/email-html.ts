import "server-only";
import sanitizeHtml from "sanitize-html";
import { SIGNATURE_FONT_LINK } from "./signature";

/**
 * The composer's HTML, cleaned before it is sent: only text formatting survives (bold, italic, underline, fonts,
 * sizes, colours, alignment, lists, links). Scripts, images, iframes, event handlers and pasted page styles are dropped.
 */
const COLOR = [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i, /^[a-z]+$/i];
export function cleanEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["p", "div", "br", "span", "b", "strong", "i", "em", "u", "s", "strike", "font", "a", "ul", "ol", "li", "blockquote", "sub", "sup", "h1", "h2", "h3"],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      font: ["color", "face", "size"],
      "*": ["style", "align"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedStyles: {
      "*": {
        color: COLOR,
        "background-color": COLOR,
        "font-size": [/^(xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|\d{1,3}(\.\d+)?(px|pt|em|rem|%))$/i],
        "font-family": [/^[\w\s,'"-]{1,200}$/],
        "font-weight": [/^(normal|bold|bolder|lighter|\d{3})$/i],
        "font-style": [/^(normal|italic|oblique)$/i],
        "text-decoration": [/^[a-z\s-]{1,60}$/i],
        "text-decoration-line": [/^[a-z\s-]{1,60}$/i],
        "text-align": [/^(left|right|center|justify|start|end)$/i],
        "margin-left": [/^\d{1,3}(px|em)$/i],
      },
    },
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, target: "_blank", rel: "noopener" } }),
    },
  }).trim();
}

/** Plain text as HTML paragraphs (the fallback when no formatted body arrives). */
export function textToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc(text)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 1em">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * The full email: the message in a readable default font, then the signature. A complete document, so the
 * signature's web font can be linked in the <head> for the mail apps that load it.
 */
export function emailDocument(contentHtml: string, signature: string | null): string {
  const body = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222222">${contentHtml}</div>`;
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${signature ? SIGNATURE_FONT_LINK : ""}`;
  return `<!doctype html><html><head>${head}</head><body style="margin:0">${body}${signature ? `<div style="margin-top:24px">${signature}</div>` : ""}</body></html>`;
}
