/** Seeds the rental source registry (idempotent). Usage: npm run db:seed */
import { readFileSync } from "node:fs";
import { getDb, schema, closeDb } from "@/lib/database/client";
import { ALERT_PATTERNS } from "@/integrations/providers/email-alerts";

type Entry = {
  slug: string;
  name: string;
  url: string;
  category: string;
  existsVerified: boolean | null;
  operatingStatus: string;
  longTermRental: boolean | null;
  spandauRelevance: string;
  integrationOptions: string[];
  notes: string;
};

const registry = JSON.parse(readFileSync(new URL("../data/source-registry.json", import.meta.url), "utf8")) as Entry[];
const alertSlugs = new Set(ALERT_PATTERNS.map((p) => p.slug));

export function operationalStateFor(e: Entry) {
  if (e.operatingStatus === "DEFUNCT" || e.operatingStatus === "MERGED" || e.existsVerified === false) return "UNAVAILABLE" as const;
  if (e.integrationOptions.includes("EMAIL_ALERTS") && alertSlugs.has(e.slug)) return "ALERTS_ONLY" as const;
  return "MANUAL_ONLY" as const;
}

async function main() {
  const db = getDb();
  const rows: Array<typeof schema.rentalSources.$inferInsert & { url: string; integrationMethods: string[]; verifiedAt: Date }> = registry.map((e) => ({
    slug: e.slug,
    name: e.name,
    url: e.url || "",
    category: e.category as (typeof schema.rentalSources.$inferInsert)["category"],
    coverage: `Berlin; Spandau relevance: ${e.spandauRelevance}`,
    integrationMethods: [...new Set([...e.integrationOptions, "MANUAL_IMPORT"])],
    submissionCapability: (["PORTAL", "PUBLIC_HOUSING", "PRIVATE_COMPANY", "AGGREGATOR", "TEMPORARY_FURNISHED"].includes(e.category) ? "PORTAL_FORM_MANUAL" : "UNKNOWN") as "PORTAL_FORM_MANUAL" | "UNKNOWN" | "EMAIL",
    operationalState: operationalStateFor(e),
    existsVerified: e.existsVerified,
    verificationNote: e.notes,
    verifiedAt: new Date("2026-10-24T00:00:00Z"),
  }));
  rows.push({
    slug: "manual",
    name: "Manual import",
    url: "",
    category: "AGGREGATOR",
    coverage: "Any listing pasted by the user",
    integrationMethods: ["MANUAL_IMPORT"],
    submissionCapability: "UNKNOWN",
    operationalState: "MANUAL_ONLY",
    existsVerified: true,
    verificationNote: "Listings imported by the user from any website.",
    verifiedAt: new Date(),
  });
  if (process.env.APP_ENV !== "production") {
    rows.push({
      slug: "test-provider",
      name: "Test provider (development only)",
      url: "https://test-provider.invalid",
      category: "AGGREGATOR",
      coverage: "Synthetic test data — never shown in production",
      integrationMethods: ["TEST_PROVIDER"],
      submissionCapability: "EMAIL",
      operationalState: "MANUAL_ONLY",
      existsVerified: true,
      verificationNote: "Synthetic data for automated tests.",
      verifiedAt: new Date(),
    });
  }
  for (const r of rows) {
    await db
      .insert(schema.rentalSources)
      .values(r)
      .onConflictDoUpdate({
        target: schema.rentalSources.slug,
        set: { name: r.name, url: r.url, category: r.category, coverage: r.coverage, integrationMethods: r.integrationMethods, submissionCapability: r.submissionCapability, operationalState: r.operationalState, existsVerified: r.existsVerified, verificationNote: r.verificationNote, verifiedAt: r.verifiedAt },
      });
  }
  console.log(`seeded ${rows.length} sources`);
}

if (process.argv[1]?.endsWith("seed.ts")) {
  main()
    .then(closeDb)
    .catch(async (e) => {
      console.error(e);
      await closeDb();
      process.exit(1);
    });
}
export { main as seedSources };
