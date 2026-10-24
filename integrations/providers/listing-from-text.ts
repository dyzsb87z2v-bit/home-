import { parseListingText } from "@/features/listings/parse-de";
import { emptyListing, type NormalizedListing } from "@/features/listings/types";

/** Builds a NormalizedListing from free text using the deterministic German parser only. */
export function listingFromText(sourceSlug: string, input: { title?: string | null; text: string; url?: string | null; sourceListingId?: string | null; publishedAt?: string | null; photos?: string[] }): NormalizedListing {
  const parsed = parseListingText(`${input.title ?? ""}\n${input.text}`);
  const l: NormalizedListing = { ...emptyListing(sourceSlug), ...stripUndefined(parsed) };
  l.title = input.title?.trim() || firstLine(input.text);
  l.descriptionDe = input.text.trim() || null;
  l.url = input.url ?? null;
  l.sourceListingId = input.sourceListingId ?? null;
  l.publishedAt = input.publishedAt ?? null;
  l.photos = (input.photos ?? []).filter((p) => p.startsWith("https://")).slice(0, 20);
  if (l.postalCode || l.neighborhood) l.city = "Berlin";
  if (l.postalCode && /^1[34]5\d{2}$|^13629$|^14089$/.test(l.postalCode)) l.district = "Spandau";
  return l;
}

function firstLine(t: string) {
  return t.split("\n").map((s) => s.trim()).find((s) => s.length > 3)?.slice(0, 200) ?? null;
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
