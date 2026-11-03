/*
 * Helpers for asserting on `renderToStaticMarkup` output without a DOM
 * library: decode the few entities React escapes, and reduce markup to the
 * plain text a screen reader, copy or text extraction would get.
 */

export function decodeEntities(html: string): string {
  return html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Text content of markup, skipping `aria-hidden` elements, as assistive tech reads it. */
export function accessibleText(html: string): string {
  let out = html;
  // Remove aria-hidden subtrees (innermost first, so nesting is handled).
  const hidden = /<(\w+)\b[^>]*aria-hidden="true"[^>]*>(?:(?!<\1\b)[\s\S])*?<\/\1>|<(\w+)\b[^>]*aria-hidden="true"[^>]*\/>/;
  while (hidden.test(out)) out = out.replace(hidden, "");
  return decodeEntities(out.replace(/<[^>]+>/g, ""));
}

/** The decoded text inside the first `<tag ...>…</tag>`, or null. */
export function innerTextOf(html: string, tag: string): string | null {
  const match = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`));
  return match ? decodeEntities(match[1].replace(/<[^>]+>/g, "")) : null;
}
