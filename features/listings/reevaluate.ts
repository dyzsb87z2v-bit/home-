import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/database/client";
import { criteriaFrom, getPreferences } from "@/features/matching/preferences";
import { evaluateProperty } from "./ingest";

/** Re-runs eligibility/scoring for all of a user's properties (after criteria or fact changes). */
export async function reevaluateAll(userId: string) {
  const db = getDb();
  const criteria = criteriaFrom(await getPreferences(db, userId));
  const rows = await db
    .select({ p: schema.properties, category: schema.rentalSources.category })
    .from(schema.properties)
    .leftJoin(schema.propertySourceLinks, eq(schema.propertySourceLinks.propertyId, schema.properties.id))
    .leftJoin(schema.rentalSources, eq(schema.rentalSources.id, schema.propertySourceLinks.sourceId))
    .where(eq(schema.properties.userId, userId));
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.p.id)) continue;
    seen.add(r.p.id);
    await evaluateProperty(db, r.p, criteria, r.category ?? null);
  }
  return seen.size;
}

export async function reevaluateOne(userId: string, propertyId: string) {
  const db = getDb();
  const criteria = criteriaFrom(await getPreferences(db, userId));
  const [r] = await db
    .select({ p: schema.properties, category: schema.rentalSources.category })
    .from(schema.properties)
    .leftJoin(schema.propertySourceLinks, eq(schema.propertySourceLinks.propertyId, schema.properties.id))
    .leftJoin(schema.rentalSources, eq(schema.rentalSources.id, schema.propertySourceLinks.sourceId))
    .where(eq(schema.properties.id, propertyId))
    .limit(1);
  if (!r || r.p.userId !== userId) return null;
  return evaluateProperty(db, r.p, criteria, r.category ?? null);
}
