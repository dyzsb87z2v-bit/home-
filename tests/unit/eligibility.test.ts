import { describe, expect, it } from "vitest";
import { evaluateEligibility, submissionCriteria, DEFAULT_CRITERIA, type EligibilityInput } from "@/features/matching/eligibility";

const base: EligibilityInput = {
  latitude: null,
  longitude: null,
  locationPrecision: "UNKNOWN",
  postalCode: "13585",
  district: "Spandau",
  neighborhood: null,
  city: "Berlin",
  rooms: 3,
  areaSqm: 72,
  coldRentEur: 850,
  warmRentEur: 1150,
  propertyType: "APARTMENT",
  wbsRequired: false,
  rentalDuration: "LONG_TERM",
};

const codes = (r: ReturnType<typeof evaluateEligibility>) => r.reasons.map((x) => x.code);

describe("eligibility — hard limits", () => {
  it("accepts a fully verified Spandau apartment within limits", () => {
    expect(evaluateEligibility(base).eligibility).toBe("ELIGIBLE");
  });

  it("accepts exactly €1,200 Warmmiete", () => {
    expect(evaluateEligibility({ ...base, warmRentEur: 1200 }).eligibility).toBe("ELIGIBLE");
  });

  it("rejects €1,200.01 Warmmiete", () => {
    const r = evaluateEligibility({ ...base, warmRentEur: 1200.01 });
    expect(r.eligibility).toBe("INELIGIBLE");
    expect(codes(r)).toContain("WARM_RENT_TOO_HIGH");
  });

  it("rejects €1,350 Warmmiete with reason params", () => {
    const r = evaluateEligibility({ ...base, warmRentEur: 1350 });
    expect(r.reasons[0]).toEqual({ code: "WARM_RENT_TOO_HIGH", params: { warm: 1350, max: 1200 } });
  });

  it("never treats Kaltmiete as Warmmiete: missing warm → NEEDS_VERIFICATION", () => {
    const r = evaluateEligibility({ ...base, warmRentEur: null, coldRentEur: 800 });
    expect(r.eligibility).toBe("NEEDS_VERIFICATION");
    expect(codes(r)).toContain("WARM_RENT_UNKNOWN");
  });

  it("rejects when Kaltmiete alone already exceeds the limit", () => {
    const r = evaluateEligibility({ ...base, warmRentEur: null, coldRentEur: 1250 });
    expect(r.eligibility).toBe("INELIGIBLE");
    expect(codes(r)).toContain("COLD_RENT_ALREADY_TOO_HIGH");
  });

  it("requires at least 3 rooms", () => {
    expect(evaluateEligibility({ ...base, rooms: 2.5 }).eligibility).toBe("INELIGIBLE");
    expect(evaluateEligibility({ ...base, rooms: 3 }).eligibility).toBe("ELIGIBLE");
    expect(evaluateEligibility({ ...base, rooms: null }).eligibility).toBe("NEEDS_VERIFICATION");
  });

  it("requires at least 50 m²", () => {
    expect(evaluateEligibility({ ...base, areaSqm: 49.9 }).eligibility).toBe("INELIGIBLE");
    expect(evaluateEligibility({ ...base, areaSqm: 50 }).eligibility).toBe("ELIGIBLE");
    expect(evaluateEligibility({ ...base, areaSqm: null }).eligibility).toBe("NEEDS_VERIFICATION");
  });

  it("excludes WBS-required listings and flags unknown WBS", () => {
    expect(evaluateEligibility({ ...base, wbsRequired: true }).eligibility).toBe("INELIGIBLE");
    expect(evaluateEligibility({ ...base, wbsRequired: null }).eligibility).toBe("NEEDS_VERIFICATION");
  });

  it("excludes rooms, WG, holiday flats, dorms and hotels", () => {
    for (const t of ["ROOM", "SHARED_APARTMENT", "HOLIDAY", "DORMITORY", "HOTEL"] as const) {
      expect(evaluateEligibility({ ...base, propertyType: t }).eligibility).toBe("INELIGIBLE");
    }
    expect(evaluateEligibility({ ...base, propertyType: "UNKNOWN" }).eligibility).toBe("NEEDS_VERIFICATION");
  });

  it("excludes temporary rentals when long-term is required", () => {
    expect(evaluateEligibility({ ...base, rentalDuration: "TEMPORARY" }).eligibility).toBe("INELIGIBLE");
  });

  it("failed criteria win over unknown ones", () => {
    const r = evaluateEligibility({ ...base, warmRentEur: 1500, rooms: null });
    expect(r.eligibility).toBe("INELIGIBLE");
    expect(codes(r)).toEqual(expect.arrayContaining(["WARM_RENT_TOO_HIGH", "ROOMS_UNKNOWN"]));
  });

  it("rejects unavailable listings", () => {
    expect(evaluateEligibility({ ...base, unavailable: true }).eligibility).toBe("INELIGIBLE");
  });
});

describe("eligibility — Spandau geography", () => {
  it("rejects non-Spandau Berlin postal codes", () => {
    const r = evaluateEligibility({ ...base, postalCode: "10115", district: null });
    expect(r.eligibility).toBe("INELIGIBLE");
    expect(codes(r)).toContain("OUTSIDE_SPANDAU");
  });

  it("rejects Falkensee (Brandenburg) postal code", () => {
    expect(evaluateEligibility({ ...base, postalCode: "14612", district: null }).eligibility).toBe("INELIGIBLE");
  });

  it("accepts every exclusive Spandau postal code", () => {
    for (const plz of ["13581", "13583", "13585", "13587", "13589", "13591", "13593", "13595", "13597", "13599", "14089"]) {
      expect(evaluateEligibility({ ...base, postalCode: plz, district: null }).eligibility).toBe("ELIGIBLE");
    }
  });

  it("13629 needs a locality signal", () => {
    expect(evaluateEligibility({ ...base, postalCode: "13629", district: null, neighborhood: null }).eligibility).toBe("NEEDS_VERIFICATION");
    expect(evaluateEligibility({ ...base, postalCode: "13629", district: null, neighborhood: "Siemensstadt" }).eligibility).toBe("ELIGIBLE");
    expect(evaluateEligibility({ ...base, postalCode: "13629", district: "Charlottenburg-Nord", neighborhood: null }).eligibility).toBe("INELIGIBLE");
  });

  it("uses exact coordinates against the official boundary", () => {
    // Spandau Rathaus / Altstadt
    expect(evaluateEligibility({ ...base, postalCode: null, district: null, latitude: 52.5355, longitude: 13.1994, locationPrecision: "EXACT" }).eligibility).toBe("ELIGIBLE");
    // Alexanderplatz
    expect(evaluateEligibility({ ...base, postalCode: null, district: null, latitude: 52.5219, longitude: 13.4132, locationPrecision: "EXACT" }).eligibility).toBe("INELIGIBLE");
  });

  it("does not trust approximate coordinates", () => {
    const r = evaluateEligibility({ ...base, postalCode: null, district: null, latitude: 52.5355, longitude: 13.1994, locationPrecision: "APPROXIMATE" });
    expect(r.eligibility).toBe("NEEDS_VERIFICATION");
  });

  it("accepts locality names (Kladow, Hakenfelde) and rejects other districts", () => {
    expect(evaluateEligibility({ ...base, postalCode: null, district: null, neighborhood: "Kladow" }).eligibility).toBe("ELIGIBLE");
    expect(evaluateEligibility({ ...base, postalCode: null, district: null, neighborhood: "Falkenhagener Feld" }).eligibility).toBe("ELIGIBLE");
    expect(evaluateEligibility({ ...base, postalCode: null, district: "Neukölln", neighborhood: null }).eligibility).toBe("INELIGIBLE");
    expect(evaluateEligibility({ ...base, postalCode: null, district: null, neighborhood: null }).eligibility).toBe("NEEDS_VERIFICATION");
  });
});

describe("submission criteria", () => {
  it("clamps any user-raised limit to the €1,200 hard ceiling", () => {
    expect(submissionCriteria({ ...DEFAULT_CRITERIA, maxWarmRentEur: 1500 }).maxWarmRentEur).toBe(1200);
    expect(submissionCriteria({ ...DEFAULT_CRITERIA, maxWarmRentEur: 1000 }).maxWarmRentEur).toBe(1000);
  });
});
