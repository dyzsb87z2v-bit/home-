import { and, desc, eq, inArray, ne, or } from "drizzle-orm";
import { getDb, schema, type Database } from "@/lib/database/client";
import { recordActivity } from "@/lib/logging";
import { evaluateEligibility, type Criteria } from "@/features/matching/eligibility";
import { criteriaFrom, getPreferences } from "@/features/matching/preferences";
import { scoreListing } from "@/features/matching/scoring";
import { notify } from "@/features/notifications/service";
import { canonicalizeUrl, fingerprint, isLikelyDuplicate } from "./dedupe";
import type { NormalizedListing } from "./types";

type PropertyRow = typeof schema.properties.$inferSelect;
type SourceRow = typeof schema.rentalSources.$inferSelect;

/** Fields copied from a listing onto a property. */
const FACT_FIELDS = [
  "title", "descriptionDe", "street", "houseNumber", "postalCode", "neighborhood", "district", "city",
  "latitude", "longitude", "rooms", "areaSqm", "coldRentEur", "warmRentEur", "serviceChargesEur",
  "heatingCostsEur", "heatingIncluded", "otherCostsEur", "depositText", "furnished", "kitchen", "balcony", "terrace",
  "elevator", "floor", "accessible", "availableFrom", "availableFromText", "wbsRequired", "cooperativeMembership",
  "landlordName", "contactEmail", "contactMethod",
] as const satisfies ReadonlyArray<keyof NormalizedListing & keyof PropertyRow>;

const ENUM_FIELDS = ["propertyType", "rentalDuration", "locationPrecision"] as const;
const UNKNOWN_ENUM: Record<(typeof ENUM_FIELDS)[number], string> = { propertyType: "UNKNOWN", rentalDuration: "UNKNOWN", locationPrecision: "UNKNOWN" };

/**
 * Merge policy: data from the same source overwrites (it is the newest version of that listing);
 * data from another source only fills unknown fields — it never overwrites known facts.
 */
export function mergeFacts(existing: Partial<PropertyRow> | null, l: NormalizedListing, sameSource: boolean): Partial<PropertyRow> {
  const out: Record<string, unknown> = {};
  for (const f of FACT_FIELDS) {
    const incoming = l[f];
    if (incoming == null) continue;
    const current = existing?.[f];
    if (current == null || sameSource) out[f] = incoming;
  }
  for (const f of ENUM_FIELDS) {
    const incoming = l[f];
    if (incoming === UNKNOWN_ENUM[f]) continue;
    const current = existing?.[f];
    if (current == null || current === UNKNOWN_ENUM[f] || sameSource) out[f] = incoming;
  }
  if (l.publishedAt && !existing?.publishedAt) out.publishedAt = new Date(l.publishedAt);
  return out as Partial<PropertyRow>;
}

export async function evaluateProperty(db: Database, p: PropertyRow, criteria: Criteria, sourceCategory: string | null) {
  const photos = await db.select({ url: schema.propertyPhotos.url }).from(schema.propertyPhotos).where(eq(schema.propertyPhotos.propertyId, p.id));
  const elig = evaluateEligibility({ ...p, unavailable: p.availability === "UNAVAILABLE" }, criteria);
  const score = scoreListing({ ...p, photos: photos.map((x) => x.url), sourceCategory });
  const changed = elig.eligibility !== p.eligibility || score.score !== p.score;
  const [last] = await db
    .select()
    .from(schema.propertyEvaluations)
    .where(eq(schema.propertyEvaluations.propertyId, p.id))
    .orderBy(desc(schema.propertyEvaluations.evaluatedAt))
    .limit(1);
  if (changed || !last || JSON.stringify(last.reasons) !== JSON.stringify(elig.reasons)) {
    await db.insert(schema.propertyEvaluations).values({
      propertyId: p.id,
      eligibility: elig.eligibility,
      reasons: elig.reasons,
      score: score.score,
      scoreBreakdown: score.breakdown,
      criteria: criteria as unknown as Record<string, unknown>,
    });
  }
  await db.update(schema.properties).set({ eligibility: elig.eligibility, score: score.score }).where(eq(schema.properties.id, p.id));
  return { previous: p.eligibility, ...elig, score: score.score, tier: score.tier };
}

export interface IngestStats {
  fetched: number;
  created: number;
  updated: number;
  newEligibleIds: string[];
  touchedIds: string[];
}

async function findExisting(db: Database, userId: string, source: SourceRow, l: NormalizedListing, fp: string, canon: string | null) {
  // 1) same source listing id or same canonical URL
  const linkConds = [];
  if (l.sourceListingId) linkConds.push(and(eq(schema.propertySourceLinks.sourceId, source.id), eq(schema.propertySourceLinks.sourceListingId, l.sourceListingId)));
  if (canon) linkConds.push(eq(schema.propertySourceLinks.canonicalUrl, canon));
  if (linkConds.length) {
    const [link] = await db
      .select()
      .from(schema.propertySourceLinks)
      .where(and(eq(schema.propertySourceLinks.userId, userId), or(...linkConds)))
      .limit(1);
    if (link) {
      const [p] = await db.select().from(schema.properties).where(eq(schema.properties.id, link.propertyId));
      if (p) return { property: p, link };
    }
  }
  // 2) same cross-source fingerprint
  const [byFp] = await db.select().from(schema.properties).where(and(eq(schema.properties.userId, userId), eq(schema.properties.fingerprint, fp))).limit(1);
  if (byFp) return { property: byFp, link: null };
  // 3) conservative fuzzy match within same PLZ and room count
  if (l.postalCode && l.rooms != null) {
    const candidates = await db
      .select()
      .from(schema.properties)
      .where(and(eq(schema.properties.userId, userId), eq(schema.properties.postalCode, l.postalCode), eq(schema.properties.rooms, l.rooms)))
      .limit(50);
    const hit = candidates.find((c) => isLikelyDuplicate(c, l));
    if (hit) return { property: hit, link: null };
  }
  return null;
}

/** Persists listings from one source for one user: dedupe → merge → evaluate → notify. */
export async function ingestListings(userId: string, sourceSlug: string, listings: NormalizedListing[], opts: { isSample?: boolean } = {}): Promise<IngestStats> {
  const db = getDb();
  const [source] = await db.select().from(schema.rentalSources).where(eq(schema.rentalSources.slug, sourceSlug));
  if (!source) throw new Error(`unknown source ${sourceSlug}`);
  const criteria = criteriaFrom(await getPreferences(db, userId));
  const stats: IngestStats = { fetched: listings.length, created: 0, updated: 0, newEligibleIds: [], touchedIds: [] };

  for (const l of listings) {
    const canon = canonicalizeUrl(l.url);
    const fp = fingerprint(l);
    const now = new Date();

    const result = await db.transaction(async (tx) => {
      const found = await findExisting(tx as unknown as Database, userId, source, l, fp, canon);
      let property: PropertyRow;
      let created = false;
      if (found) {
        const sameSource = !!found.link;
        const patch = mergeFacts(found.property, l, sameSource);
        const availability = l.unavailable ? "UNAVAILABLE" : "AVAILABLE";
        const [u] = await tx
          .update(schema.properties)
          .set({ ...patch, availability, lastVerifiedAt: now })
          .where(eq(schema.properties.id, found.property.id))
          .returning();
        property = u!;
      } else {
        const patch = mergeFacts(null, l, true);
        const [c] = await tx
          .insert(schema.properties)
          .values({ userId, fingerprint: fp, ...patch, availability: l.unavailable ? "UNAVAILABLE" : "AVAILABLE", lastVerifiedAt: now, isSample: !!opts.isSample })
          .onConflictDoNothing()
          .returning();
        if (!c) {
          const [again] = await tx.select().from(schema.properties).where(and(eq(schema.properties.userId, userId), eq(schema.properties.fingerprint, fp)));
          property = again!;
        } else {
          property = c;
          created = true;
        }
      }

      if (found?.link) {
        await tx.update(schema.propertySourceLinks).set({ lastSeenAt: now, url: l.url ?? found.link.url, raw: l.raw ?? found.link.raw }).where(eq(schema.propertySourceLinks.id, found.link.id));
      } else {
        await tx
          .insert(schema.propertySourceLinks)
          .values({ propertyId: property.id, userId, sourceId: source.id, sourceListingId: l.sourceListingId, url: l.url, canonicalUrl: canon, raw: l.raw ?? null, lastSeenAt: now })
          .onConflictDoNothing();
      }

      for (const [i, url] of l.photos.entries()) {
        await tx.insert(schema.propertyPhotos).values({ propertyId: property.id, url, position: i, sourceId: source.id }).onConflictDoNothing();
      }
      return { property, created, merged: !!found && !found.link, wasAvailable: found?.property.availability !== "UNAVAILABLE" };
    });

    const evalResult = await evaluateProperty(db, result.property, criteria, source.category);
    stats.touchedIds.push(result.property.id);
    if (result.created) stats.created++;
    else stats.updated++;

    if (result.created) {
      await recordActivity({ userId, action: "listing.discovered", result: "INFO", propertyId: result.property.id, sourceId: source.id, details: { title: result.property.title, eligibility: evalResult.eligibility } });
    } else if (result.merged) {
      await recordActivity({ userId, action: "listing.duplicate_merged", result: "INFO", propertyId: result.property.id, sourceId: source.id, details: { url: l.url } });
    }
    if (evalResult.eligibility !== evalResult.previous || result.created) {
      const firstReason = evalResult.reasons[0];
      await recordActivity({
        userId,
        action: evalResult.eligibility === "ELIGIBLE" ? "listing.eligible" : evalResult.eligibility === "INELIGIBLE" ? "listing.rejected" : "listing.needs_verification",
        result: "INFO",
        propertyId: result.property.id,
        sourceId: source.id,
        details: { reason: firstReason?.code ?? null, params: firstReason?.params ?? {} },
      });
    }
    if (evalResult.eligibility === "ELIGIBLE" && evalResult.previous !== "ELIGIBLE") {
      stats.newEligibleIds.push(result.property.id);
      const high = evalResult.tier === "VERY_HIGH" || evalResult.tier === "HIGH";
      await notify(userId, high ? "HIGH_PRIORITY" : "NEW_ELIGIBLE", result.property.id, { title: result.property.title, warm: result.property.warmRentEur, rooms: result.property.rooms, area: result.property.areaSqm }, `/apartments/${result.property.id}`);
    }
    if (l.unavailable && !result.created && result.wasAvailable) {
      await notify(userId, "LISTING_UNAVAILABLE", result.property.id, { title: result.property.title }, `/apartments/${result.property.id}`);
    }
  }
  return stats;
}

/** Marks listings of a feed source that disappeared from the feed as unavailable. */
export async function markMissingAsUnavailable(userId: string, sourceId: string, seenListingIds: string[]) {
  const db = getDb();
  const links = await db
    .select({ propertyId: schema.propertySourceLinks.propertyId, sourceListingId: schema.propertySourceLinks.sourceListingId })
    .from(schema.propertySourceLinks)
    .where(and(eq(schema.propertySourceLinks.userId, userId), eq(schema.propertySourceLinks.sourceId, sourceId)));
  const missing = links.filter((l) => l.sourceListingId && !seenListingIds.includes(l.sourceListingId)).map((l) => l.propertyId);
  if (!missing.length) return 0;
  // Only if no other source still lists them
  const elsewhere = await db
    .select({ propertyId: schema.propertySourceLinks.propertyId })
    .from(schema.propertySourceLinks)
    .where(and(inArray(schema.propertySourceLinks.propertyId, missing), ne(schema.propertySourceLinks.sourceId, sourceId)));
  const keep = new Set(elsewhere.map((s) => s.propertyId));
  const toMark = missing.filter((m) => !keep.has(m));
  if (toMark.length) await db.update(schema.properties).set({ availability: "UNAVAILABLE" }).where(inArray(schema.properties.id, toMark));
  return toMark.length;
}
