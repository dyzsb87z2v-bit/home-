import { XMLParser } from "fast-xml-parser";
import { htmlToText, extractImageUrls } from "@/lib/html";
import { politeFetch } from "./http";
import { listingFromText } from "./listing-from-text";
import { AdapterError, type SourceAdapter, type SyncResult } from "./types";

/**
 * RSS 2.0 / Atom / JSON Feed adapter for sources that publish an official listing feed.
 * Config: { url: "https://…" }
 */

type FeedItem = { id: string | null; title: string | null; link: string | null; html: string; published: string | null };

export function parseFeed(body: string, contentType = ""): FeedItem[] {
  const trimmed = body.trim();
  if (contentType.includes("json") || trimmed.startsWith("{")) {
    const j = JSON.parse(trimmed) as { items?: Array<Record<string, unknown>> };
    return (j.items ?? []).map((it) => ({
      id: (it.id as string) ?? null,
      title: (it.title as string) ?? null,
      link: (it.url as string) ?? null,
      html: ((it.content_html as string) ?? (it.content_text as string) ?? (it.summary as string) ?? "") + (it.image ? `<img src="${it.image}">` : ""),
      published: (it.date_published as string) ?? null,
    }));
  }
  const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text" }).parse(trimmed);
  const asArray = <T,>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
  const text = (v: unknown): string | null => (v == null ? null : typeof v === "object" ? String((v as Record<string, unknown>)["#text"] ?? "") : String(v));

  if (xml.rss?.channel) {
    return asArray(xml.rss.channel.item).map((it: Record<string, unknown>) => {
      const enclosure = it.enclosure as Record<string, string> | undefined;
      return {
        id: text(it.guid),
        title: text(it.title),
        link: text(it.link),
        html: (text(it["content:encoded"]) ?? text(it.description) ?? "") + (enclosure?.["@_url"] ? `<img src="${enclosure["@_url"]}">` : ""),
        published: text(it.pubDate),
      };
    });
  }
  if (xml.feed) {
    return asArray(xml.feed.entry).map((it: Record<string, unknown>) => {
      const links = asArray(it.link as Record<string, string> | Record<string, string>[]);
      const href = links.find((l) => !l["@_rel"] || l["@_rel"] === "alternate")?.["@_href"] ?? null;
      return { id: text(it.id), title: text(it.title), link: href, html: text(it.content) ?? text(it.summary) ?? "", published: text(it.published) ?? text(it.updated) };
    });
  }
  throw new AdapterError("PARSE_ERROR", "Unrecognized feed format");
}

export const feedAdapter: SourceAdapter = {
  id: "feed",
  kind: "polling",
  validateConfig(config) {
    const url = config.url;
    if (typeof url !== "string" || !/^https:\/\//.test(url)) throw new AdapterError("CONFIG_INVALID", "feed url (https) required");
  },
  async sync(ctx): Promise<SyncResult> {
    const res = await politeFetch(String(ctx.config.url), { signal: ctx.signal, accept: "application/rss+xml, application/atom+xml, application/feed+json, application/json, text/xml" });
    const items = parseFeed(await res.text(), res.headers.get("content-type") ?? "");
    const listings = items.map((it) => {
      const publishedAt = it.published && !isNaN(Date.parse(it.published)) ? new Date(it.published).toISOString() : null;
      return listingFromText(ctx.sourceSlug, {
        title: it.title,
        text: htmlToText(it.html),
        url: it.link,
        sourceListingId: it.id ?? it.link,
        publishedAt,
        photos: extractImageUrls(it.html),
      });
    });
    return { listings, notes: [`${items.length} feed items`] };
  },
};
