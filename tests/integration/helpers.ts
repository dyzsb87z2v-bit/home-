import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/database/client";
import { setupUser } from "@/features/users/setup";
import { emptyListing, type NormalizedListing } from "@/features/listings/types";

export async function makeUser() {
  const db = getDb();
  const [u] = await db.insert(schema.users).values({ email: `u-${randomUUID()}@test.invalid`, passwordHash: "x" }).returning();
  await setupUser(db, u!.id, { fullName: "Milad Masoudi" });
  return u!;
}

export async function testMailbox(userId: string) {
  const [a] = await getDb().insert(schema.emailAccounts).values({ userId, provider: "TEST", emailAddress: "tester@test.invalid", status: "CONNECTED" }).returning();
  return a!;
}

export function eligibleListing(id: string, patch: Partial<NormalizedListing> = {}): NormalizedListing {
  return {
    ...emptyListing("test-provider"),
    sourceListingId: id,
    url: `https://test-provider.invalid/l/${id}`,
    title: `Wohnung ${id}`,
    street: "Teststraße",
    houseNumber: id,
    postalCode: "13595",
    district: "Spandau",
    city: "Berlin",
    rooms: 3,
    areaSqm: 70,
    warmRentEur: 1100,
    propertyType: "APARTMENT",
    rentalDuration: "LONG_TERM",
    wbsRequired: false,
    contactEmail: `landlord-${id}@test.invalid`.toLowerCase(),
    ...patch,
  };
}

export async function authorizeAuto(userId: string, accountId: string, opts: { maxPerDay?: number; minScore?: number } = {}) {
  await getDb()
    .update(schema.searchPreferences)
    .set({
      automationMode: "AUTO_APPLY",
      autoApplyEnabled: true,
      autoApplyAuthorization: { authorizedAt: new Date().toISOString(), emailAccountId: accountId, channels: ["EMAIL"], maxPerDay: opts.maxPerDay ?? 10, minScore: opts.minScore ?? 0, onlyEligible: true, statement: "test" },
    })
    .where(eq(schema.searchPreferences.userId, userId));
}
