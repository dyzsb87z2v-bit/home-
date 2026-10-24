import { createHash } from "node:crypto";
import type { NormalizedListing } from "./types";

/** Canonical URL: lower-case host, no tracking params, no fragment, no trailing slash. */
export function canonicalizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    const drop = [/^utm_/, /^ref/, /^fbclid$/, /^gclid$/, /^source$/, /^campaign/, /^mc_/, /^referrer/];
    for (const key of [...u.searchParams.keys()]) if (drop.some((r) => r.test(key))) u.searchParams.delete(key);
    u.searchParams.sort();
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString();
  } catch {
    return null;
  }
}

export function normalizeStreet(street: string | null | undefined): string | null {
  if (!street) return null;
  return street
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/str(\.|asse|aße)?\b/g, "str")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Cross-source fingerprint. Uses address + rent + size when an address is published;
 * otherwise falls back to source identity (so unrelated address-less listings never merge).
 */
export function fingerprint(l: Pick<NormalizedListing, "street" | "houseNumber" | "postalCode" | "rooms" | "areaSqm" | "warmRentEur" | "coldRentEur" | "sourceSlug" | "sourceListingId" | "url" | "title" | "descriptionDe">): string {
  const street = normalizeStreet(l.street);
  if (street && l.postalCode && (l.areaSqm != null || l.rooms != null)) {
    const area = l.areaSqm != null ? Math.round(l.areaSqm) : "x";
    const rooms = l.rooms != null ? l.rooms : "x";
    const hn = (l.houseNumber ?? "").toLowerCase().replace(/\s/g, "");
    return `addr:${l.postalCode}:${street}:${hn}:${rooms}:${area}`;
  }
  if (l.sourceListingId) return `src:${l.sourceSlug}:${l.sourceListingId}`;
  const canon = canonicalizeUrl(l.url);
  if (canon) return `url:${canon}`;
  const content = `${l.title ?? ""}\n${l.descriptionDe ?? ""}`;
  return `txt:${l.sourceSlug}:${createHash("sha256").update(content).digest("hex").slice(0, 24)}`;
}

/** Token-set Jaccard similarity on normalized words (length ≥ 3). */
export function textSimilarity(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const tok = (s: string) => new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3));
  const A = tok(a);
  const B = tok(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

type Comparable = Pick<NormalizedListing, "postalCode" | "rooms" | "areaSqm" | "warmRentEur" | "coldRentEur" | "title" | "descriptionDe" | "street" | "houseNumber">;

/**
 * Fuzzy duplicate check for listings lacking a shared fingerprint (e.g. one source publishes
 * the street, another does not). Conservative: requires same PLZ, same rooms, area ±1 m²,
 * rent ±2 % and either the same street or strong text similarity.
 */
export function isLikelyDuplicate(a: Comparable, b: Comparable): boolean {
  if (!a.postalCode || a.postalCode !== b.postalCode) return false;
  if (a.rooms == null || a.rooms !== b.rooms) return false;
  if (a.areaSqm == null || b.areaSqm == null || Math.abs(a.areaSqm - b.areaSqm) > 1) return false;
  const ra = a.warmRentEur ?? a.coldRentEur;
  const rb = b.warmRentEur ?? b.coldRentEur;
  if (ra == null || rb == null || Math.abs(ra - rb) / Math.max(ra, rb) > 0.02) return false;
  const sa = normalizeStreet(a.street);
  const sb = normalizeStreet(b.street);
  if (sa && sb) {
    if (sa !== sb) return false;
    const ha = a.houseNumber?.toLowerCase().replace(/\s/g, "");
    const hb = b.houseNumber?.toLowerCase().replace(/\s/g, "");
    return !ha || !hb || ha === hb;
  }
  const sim = Math.max(textSimilarity(a.title, b.title), textSimilarity(a.descriptionDe, b.descriptionDe));
  return sim >= 0.5;
}

export function normalizeRecipient(r: string): string {
  return r.trim().toLowerCase();
}
