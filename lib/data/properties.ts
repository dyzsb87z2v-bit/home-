import { and, asc, desc, eq, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/lib/database/client";

export type ListOptions = {
  eligibility?: Array<"ELIGIBLE" | "INELIGIBLE" | "NEEDS_VERIFICATION">;
  saved?: boolean;
  sort?: "newest" | "score" | "price";
  limit?: number;
  offset?: number;
  withCoordinates?: boolean;
};

/** Paginated property list for one user, with first photo, latest reason and source name. */
export async function listProperties(userId: string, o: ListOptions = {}) {
  const db = getDb();
  const conds: SQL[] = [eq(schema.properties.userId, userId), eq(schema.properties.hidden, false)];
  if (o.eligibility?.length) conds.push(inArray(schema.properties.eligibility, o.eligibility));
  if (o.saved) conds.push(eq(schema.properties.saved, true));
  if (o.withCoordinates) conds.push(isNotNull(schema.properties.latitude));
  if (process.env.APP_ENV === "production") conds.push(eq(schema.properties.isSample, false));
  const order =
    o.sort === "score"
      ? [desc(sql`coalesce(${schema.properties.score}, -1)`), desc(schema.properties.firstSeenAt)]
      : o.sort === "price"
        ? [asc(sql`coalesce(${schema.properties.warmRentEur}, 99999)`), desc(schema.properties.firstSeenAt)]
        : [desc(schema.properties.firstSeenAt)];
  const rows = await db
    .select()
    .from(schema.properties)
    .where(and(...conds))
    .orderBy(...order)
    .limit(o.limit ?? 30)
    .offset(o.offset ?? 0);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [photos, evals, links] = await Promise.all([
    db.select().from(schema.propertyPhotos).where(inArray(schema.propertyPhotos.propertyId, ids)).orderBy(asc(schema.propertyPhotos.position)),
    db
      .selectDistinctOn([schema.propertyEvaluations.propertyId], { propertyId: schema.propertyEvaluations.propertyId, reasons: schema.propertyEvaluations.reasons })
      .from(schema.propertyEvaluations)
      .where(inArray(schema.propertyEvaluations.propertyId, ids))
      .orderBy(schema.propertyEvaluations.propertyId, desc(schema.propertyEvaluations.evaluatedAt)),
    db
      .select({ propertyId: schema.propertySourceLinks.propertyId, name: schema.rentalSources.name })
      .from(schema.propertySourceLinks)
      .innerJoin(schema.rentalSources, eq(schema.rentalSources.id, schema.propertySourceLinks.sourceId))
      .where(inArray(schema.propertySourceLinks.propertyId, ids)),
  ]);
  return rows.map((p) => ({
    p,
    photo: photos.find((ph) => ph.propertyId === p.id)?.url ?? null,
    reason: evals.find((e) => e.propertyId === p.id)?.reasons[0] ?? null,
    sourceName: [...new Set(links.filter((l) => l.propertyId === p.id).map((l) => l.name))].join(", ") || null,
  }));
}

export async function countByEligibility(userId: string) {
  const conds: SQL[] = [eq(schema.properties.userId, userId), eq(schema.properties.hidden, false)];
  if (process.env.APP_ENV === "production") conds.push(eq(schema.properties.isSample, false));
  const rows = await getDb()
    .select({ e: schema.properties.eligibility, n: sql<number>`count(*)::int` })
    .from(schema.properties)
    .where(and(...conds))
    .groupBy(schema.properties.eligibility);
  return Object.fromEntries(rows.map((r) => [r.e, r.n])) as Record<string, number>;
}
