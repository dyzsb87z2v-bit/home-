import { eq } from "drizzle-orm";
import type { Database } from "@/lib/database/client";
import { schema } from "@/lib/database/client";
import { DEFAULT_CRITERIA, type Criteria } from "./eligibility";

export type Preferences = typeof schema.searchPreferences.$inferSelect;

export async function getPreferences(db: Database, userId: string): Promise<Preferences> {
  const [p] = await db.select().from(schema.searchPreferences).where(eq(schema.searchPreferences.userId, userId)).limit(1);
  if (p) return p;
  const [created] = await db.insert(schema.searchPreferences).values({ userId }).onConflictDoNothing().returning();
  if (created) return created;
  const [again] = await db.select().from(schema.searchPreferences).where(eq(schema.searchPreferences.userId, userId)).limit(1);
  return again!;
}

export function criteriaFrom(p: Preferences): Criteria {
  return {
    ...DEFAULT_CRITERIA,
    maxWarmRentEur: p.maxWarmRentEur,
    minRooms: p.minRooms,
    minAreaSqm: p.minAreaSqm,
    requireEntireApartment: p.requireEntireApartment,
    excludeWbs: p.excludeWbs,
    longTermOnly: p.longTermOnly,
  };
}
