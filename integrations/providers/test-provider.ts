import { emptyListing, type NormalizedListing } from "@/features/listings/types";
import { AdapterError, type SourceAdapter } from "./types";

/**
 * Deterministic in-house provider for DEVELOPMENT/TESTING only. Its records are marked as
 * samples and the adapter refuses to run in production (no sample data shown as real listings).
 */
export function testListings(): NormalizedListing[] {
  const base = (id: string, patch: Partial<NormalizedListing>): NormalizedListing => ({
    ...emptyListing("test-provider"),
    sourceListingId: id,
    url: `https://test-provider.invalid/listing/${id}`,
    city: "Berlin",
    propertyType: "APARTMENT",
    rentalDuration: "LONG_TERM",
    wbsRequired: false,
    ...patch,
  });
  return [
    base("T-1", { title: "[TEST] 3-Zimmer-Wohnung mit Balkon, Wilhelmstadt", street: "Teststraße", houseNumber: "1", postalCode: "13595", district: "Spandau", neighborhood: "Wilhelmstadt", rooms: 3, areaSqm: 74, coldRentEur: 790, warmRentEur: 1090, balcony: true, availableFromText: "sofort", contactEmail: "landlord@test-provider.invalid", descriptionDe: "Testdatensatz. Helle Wohnung mit Balkon, kein WBS erforderlich, unbefristet." }),
    base("T-2", { title: "[TEST] 3 Zimmer, zu teuer", postalCode: "13581", district: "Spandau", rooms: 3, areaSqm: 80, warmRentEur: 1350, contactEmail: "landlord@test-provider.invalid" }),
    base("T-3", { title: "[TEST] Warmmiete fehlt", postalCode: "13587", district: "Spandau", rooms: 3, areaSqm: 65, coldRentEur: 820, warmRentEur: null }),
    base("T-4", { title: "[TEST] Mitte, nicht Spandau", postalCode: "10115", district: "Mitte", rooms: 3, areaSqm: 70, warmRentEur: 1100 }),
    base("T-5", { title: "[TEST] WBS erforderlich", postalCode: "13589", district: "Spandau", rooms: 3, areaSqm: 70, warmRentEur: 900, wbsRequired: true }),
  ];
}

export const testAdapter: SourceAdapter = {
  id: "test",
  kind: "polling",
  validateConfig() {
    if (process.env.APP_ENV === "production") throw new AdapterError("NOT_ALLOWED_IN_PRODUCTION", "test provider disabled in production");
  },
  async sync() {
    if (process.env.APP_ENV === "production") throw new AdapterError("NOT_ALLOWED_IN_PRODUCTION", "test provider disabled in production");
    return { listings: testListings(), notes: ["test data"] };
  },
};
