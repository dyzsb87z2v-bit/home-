import { eq } from "drizzle-orm";
import type { Database } from "@/lib/database/client";
import { schema } from "@/lib/database/client";

/**
 * Creates the household, applicant profile, preferences and source connections for a user.
 * Confirmed facts only; everything else stays unknown until the user edits the profile.
 */
export async function setupUser(db: Database, userId: string, opts: { fullName: string; contactEmail?: string | null }) {
  await db
    .insert(schema.households)
    .values({ userId, adults: 2, children: 1, childAges: [17], monthlyNetIncomeEur: 3500, incomeVerified: true })
    .onConflictDoNothing();
  await db
    .insert(schema.applicantProfiles)
    .values({
      userId,
      fullName: opts.fullName,
      contactEmail: opts.contactEmail ?? null,
      facts: {
        householdPhraseDe: { value: "gemeinsam mit meiner Partnerin und ihrer 17-jährigen Tochter", verified: true },
        householdPhraseFa: { value: "همراه با همسرم (شریک زندگی‌ام) و دختر ۱۷ سالهٔ او", verified: true },
        employment: { value: null, verified: false },
        employer: { value: null, verified: false },
        contractType: { value: null, verified: false },
        incomeBreakdown: { value: null, verified: false },
        references: { value: null, verified: false },
        pets: { value: null, verified: false },
        viewingAvailability: { value: null, verified: false },
      },
      // Private — never used in generated messages.
      privateNotes: { applicantNationality: "Iranian", partnerNationality: "Hungarian" },
    })
    .onConflictDoNothing();
  await db.insert(schema.searchPreferences).values({ userId }).onConflictDoNothing();

  const sources = await db.select().from(schema.rentalSources);
  for (const s of sources) {
    if (s.slug === "test-provider") continue;
    if (s.operationalState === "ALERTS_ONLY") {
      await db.insert(schema.sourceConnections).values({ userId, sourceId: s.id, adapter: "email-alerts", enabled: true, state: "MANUAL_ONLY", authState: "EMAIL_REQUIRED", intervalMinutes: 5 }).onConflictDoNothing();
    }
  }
  return db.select().from(schema.users).where(eq(schema.users.id, userId));
}
