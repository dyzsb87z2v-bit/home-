import { extractImageUrls, extractLinks, htmlToText } from "@/lib/html";
import type { NormalizedListing } from "@/features/listings/types";
import { listingFromText } from "./listing-from-text";
import { AdapterError, type SourceAdapter } from "./types";

/**
 * Parses saved-search alert emails the USER set up on each portal (ImmoScout24 Suchauftrag,
 * degewo/Gewobag saved searches, inberlinwohnen Angebotsalarm, …) and that arrive in the
 * user's own, OAuth-connected mailbox. No website is accessed by this adapter.
 *
 * Exact alert layouts are not publicly documented and change; parsing therefore works on
 * listing-URL patterns plus the text block around each link. Facts not visible in the
 * email stay unknown (usually → NEEDS_VERIFICATION until the user confirms them).
 */

export interface AlertSourcePattern {
  slug: string;
  senderDomains: string[];
  /** captures the listing id in group 1 */
  listingUrl: RegExp;
}

export const ALERT_PATTERNS: AlertSourcePattern[] = [
  { slug: "immoscout24", senderDomains: ["immobilienscout24.de", "is24.de", "scout24.com"], listingUrl: /https?:\/\/(?:www\.)?immobilienscout24\.de\/expose\/(\d+)/i },
  { slug: "immowelt", senderDomains: ["immowelt.de", "aviv-group.com"], listingUrl: /https?:\/\/(?:www\.)?immowelt\.de\/(?:expose|projekte\/expose)\/([a-z0-9-]+)/i },
  { slug: "kleinanzeigen", senderDomains: ["kleinanzeigen.de", "mail.kleinanzeigen.de"], listingUrl: /https?:\/\/(?:www\.)?kleinanzeigen\.de\/s-anzeige\/[^/\s"']+\/(\d+)/i },
  { slug: "wg-gesucht", senderDomains: ["wg-gesucht.de"], listingUrl: /https?:\/\/(?:www\.)?wg-gesucht\.de\/[^\s"']*?\.(\d{5,})\.html/i },
  { slug: "wohnungsboerse", senderDomains: ["wohnungsboerse.net"], listingUrl: /https?:\/\/(?:www\.)?wohnungsboerse\.net\/immodetail\/(\d+)/i },
  { slug: "ohne-makler", senderDomains: ["ohne-makler.net"], listingUrl: /https?:\/\/(?:www\.)?ohne-makler\.net\/immobilie\/(\d+)/i },
  { slug: "degewo", senderDomains: ["degewo.de"], listingUrl: /https?:\/\/(?:immosuche\.)?degewo\.de\/[^\s"']*?(?:properties|details|wohnung)[^\s"']*?\/([A-Za-z0-9.-]{4,})/i },
  { slug: "gewobag", senderDomains: ["gewobag.de"], listingUrl: /https?:\/\/(?:www\.)?gewobag\.de\/[^\s"']*?mietangebote\/([a-z0-9-]{6,})/i },
  { slug: "inberlinwohnen", senderDomains: ["inberlinwohnen.de"], listingUrl: /https?:\/\/(?:www\.)?inberlinwohnen\.de\/[^\s"']*?(?:wohnung|angebot|expose)[^\s"']*?\/([A-Za-z0-9-]{4,})/i },
  { slug: "meinestadt", senderDomains: ["meinestadt.de"], listingUrl: /https?:\/\/(?:www\.)?meinestadt\.de\/[^\s"']*?immobilien[^\s"']*?\/(\d{5,})/i },
  { slug: "waitly", senderDomains: ["waitly.eu", "waitly.dk"], listingUrl: /https?:\/\/(?:www\.)?waitly\.(?:eu|dk)\/[^\s"']*?\/(\d{3,})/i },
  { slug: "housinganywhere", senderDomains: ["housinganywhere.com"], listingUrl: /https?:\/\/(?:www\.)?housinganywhere\.com\/room\/(ut\d+|\d+)/i },
  { slug: "wohnglueck", senderDomains: ["wohnglueck.de"], listingUrl: /https?:\/\/(?:www\.)?wohnglueck\.de\/[^\s"']*?\/(\d{4,})/i },
];

export function patternForSender(fromAddress: string): AlertSourcePattern | null {
  const domain = fromAddress.toLowerCase().match(/@([a-z0-9.-]+)/)?.[1] ?? "";
  return ALERT_PATTERNS.find((p) => p.senderDomains.some((d) => domain === d || domain.endsWith(`.${d}`))) ?? null;
}

export function alertSenderQuery(): string {
  const domains = [...new Set(ALERT_PATTERNS.flatMap((p) => p.senderDomains))];
  return `from:(${domains.map((d) => `@${d}`).join(" OR ")})`;
}

/** Tracking links often wrap the real URL; unwrap common redirect params. */
function unwrap(href: string): string {
  try {
    const u = new URL(href);
    for (const key of ["url", "u", "target", "redirect", "dest"]) {
      const v = u.searchParams.get(key);
      if (v && /^https?:\/\//.test(v)) return v;
    }
  } catch {
    /* ignore */
  }
  return href;
}

export function parseAlertEmail(input: { from: string; subject: string; html?: string | null; text?: string | null; receivedAt?: string | null }): NormalizedListing[] {
  const pattern = patternForSender(input.from);
  if (!pattern) return [];
  const html = input.html ?? "";
  const links = html ? extractLinks(html).map((l) => ({ ...l, href: unwrap(l.href) })) : [];

  type Hit = { id: string; url: string; index: number };
  const hits: Hit[] = [];
  const seen = new Set<string>();
  if (links.length) {
    for (const l of links) {
      const m = l.href.match(pattern.listingUrl);
      if (m?.[1] && !seen.has(m[1])) {
        seen.add(m[1]);
        hits.push({ id: m[1], url: m[0], index: l.index });
      }
    }
  } else {
    const text = input.text ?? "";
    const re = new RegExp(pattern.listingUrl.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m[1] && !seen.has(m[1])) {
        seen.add(m[1]);
        hits.push({ id: m[1], url: m[0], index: m.index });
      }
    }
  }

  const sourceText = links.length ? html : input.text ?? "";
  return hits.map((hit, i) => {
    // The part of the email belonging to this listing: from its first link up to the next listing's
    // first link (alert layouts put image/title link first, details after). Fallback: text before it.
    const next = hits[i + 1];
    const end = next ? next.index : Math.min(sourceText.length, hit.index + 3000);
    let block = sourceText.slice(hit.index, end);
    let blockText = links.length ? htmlToText(block) : block;
    if (!/\d\s*(zimmer|zi\.|m²|m2|qm|€)/i.test(blockText)) {
      block = sourceText.slice(Math.max(i ? hits[i - 1]!.index : 0, hit.index - 1000), end);
      blockText = links.length ? htmlToText(block) : block;
    }
    const title = links.find((l) => l.index >= hit.index && l.text.length > 8)?.text ?? null;
    const l = listingFromText(pattern.slug, {
      title,
      text: blockText,
      url: hit.url,
      sourceListingId: hit.id,
      publishedAt: input.receivedAt ?? null,
      photos: links.length ? extractImageUrls(block).slice(0, 3) : [],
    });
    // An alert snippet is not a full description — do not present it as one.
    l.descriptionDe = null;
    l.raw = { alertSubject: input.subject, snippet: blockText.slice(0, 1500) };
    return l;
  });
}

export const emailAlertsAdapter: SourceAdapter = {
  id: "email-alerts",
  kind: "event",
  validateConfig(config) {
    if (config.emailAccountId != null && typeof config.emailAccountId !== "string") throw new AdapterError("CONFIG_INVALID", "emailAccountId must be a string");
  },
};
