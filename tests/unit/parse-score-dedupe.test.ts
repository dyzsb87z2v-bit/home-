import { describe, expect, it } from "vitest";
import { parseGermanNumber, parseListingText, deriveWarmRent, extractWbs } from "@/features/listings/parse-de";
import { affordabilityTier, scoreListing } from "@/features/matching/scoring";
import { canonicalizeUrl, fingerprint, isLikelyDuplicate } from "@/features/listings/dedupe";
import { emptyListing } from "@/features/listings/types";

describe("German number parsing", () => {
  it.each([
    ["1.150,50", 1150.5],
    ["1.150", 1150],
    ["72,5", 72.5],
    ["850", 850],
    ["1150.00", 1150],
    ["1 150", 1150],
  ])("%s → %d", (raw, expected) => expect(parseGermanNumber(raw)).toBe(expected));
});

describe("listing text extraction", () => {
  const text = `Schöne 3-Zimmer-Wohnung in Berlin-Spandau (Wilhelmstadt)
Adresse: Weverstraße 12, 13595 Berlin
Wohnfläche ca. 72,5 m²
Kaltmiete: 780,00 €
Nebenkosten: 210,00 €
Heizkosten: 95,00 €
Kaution: 3 Nettokaltmieten
Frei ab: 01.12.2026
Balkon, Einbauküche, kein WBS erforderlich. Unbefristeter Mietvertrag.
Kontakt: vermietung@example-hausverwaltung.de`;

  const p = parseListingText(text);

  it("extracts rooms, area, rents", () => {
    expect(p.rooms).toBe(3);
    expect(p.areaSqm).toBe(72.5);
    expect(p.coldRentEur).toBe(780);
    expect(p.serviceChargesEur).toBe(210);
    expect(p.heatingCostsEur).toBe(95);
    expect(p.warmRentEur).toBe(1085);
  });

  it("extracts location, WBS, type, duration, date, contact", () => {
    expect(p.postalCode).toBe("13595");
    expect(p.wbsRequired).toBe(false);
    expect(p.propertyType).toBe("APARTMENT");
    expect(p.rentalDuration).toBe("LONG_TERM");
    expect(p.availableFrom).toBe("2026-12-01");
    expect(p.balcony).toBe(true);
    expect(p.kitchen).toBe(true);
    expect(p.contactEmail).toBe("vermietung@example-hausverwaltung.de");
  });

  it("uses explicit Warmmiete when present", () => {
    expect(parseListingText("Warmmiete 1.190 € Kaltmiete 900 €").warmRentEur).toBe(1190);
  });

  it("does not invent Warmmiete when heating costs are unknown", () => {
    expect(parseListingText("Kaltmiete 800 € zzgl. Nebenkosten 200 €").warmRentEur).toBeNull();
    expect(deriveWarmRent({ explicitWarm: null, cold: 800, service: 200, heating: null, heatingIncluded: true, other: null })).toBe(1000);
  });

  it("detects WBS requirement phrasings", () => {
    expect(extractWbs("Nur mit WBS")).toBe(true);
    expect(extractWbs("WBS 140 erforderlich")).toBe(true);
    expect(extractWbs("WBS erforderlich")).toBe(true);
    expect(extractWbs("ohne WBS")).toBe(false);
    expect(extractWbs("Helle Wohnung")).toBeNull();
  });

  it("detects WG rooms and temporary offers", () => {
    expect(parseListingText("WG-Zimmer in 3er WG frei").propertyType).toBe("SHARED_APARTMENT");
    expect(parseListingText("Möblierte Wohnung auf Zeit, befristet bis 03/2027").rentalDuration).toBe("TEMPORARY");
  });
});

describe("scoring", () => {
  it("assigns affordability tiers per spec", () => {
    expect(affordabilityTier(900)).toBe("VERY_HIGH");
    expect(affordabilityTier(901)).toBe("HIGH");
    expect(affordabilityTier(1050)).toBe("HIGH");
    expect(affordabilityTier(1100)).toBe("GOOD");
    expect(affordabilityTier(1151)).toBe("ACCEPTABLE");
    expect(affordabilityTier(1201)).toBe("OVER_BUDGET");
    expect(affordabilityTier(null)).toBe("UNKNOWN");
  });

  it("cheaper, bigger, sooner scores higher", () => {
    const now = new Date("2026-10-24T00:00:00Z");
    const a = scoreListing({ ...emptyListing("x"), warmRentEur: 880, areaSqm: 85, rooms: 3, availableFrom: "2026-11-01", rentalDuration: "LONG_TERM" }, now);
    const b = scoreListing({ ...emptyListing("x"), warmRentEur: 1190, areaSqm: 52, rooms: 3, availableFrom: "2027-03-01", rentalDuration: "UNKNOWN" }, now);
    expect(a.score).toBeGreaterThan(b.score);
    expect(a.score).toBeLessThanOrEqual(100);
  });
});

describe("dedupe", () => {
  it("canonicalizes URLs", () => {
    expect(canonicalizeUrl("https://WWW.Example.de/expose/123/?utm_source=mail&b=2&a=1#top")).toBe("https://example.de/expose/123?a=1&b=2");
  });

  it("same address + size across sources → same fingerprint", () => {
    const a = { ...emptyListing("immoscout24"), street: "Weverstraße", houseNumber: "12", postalCode: "13595", rooms: 3, areaSqm: 72.4, sourceListingId: "1" };
    const b = { ...emptyListing("gewobag"), street: "Weverstr.", houseNumber: "12", postalCode: "13595", rooms: 3, areaSqm: 72.0, sourceListingId: "X9" };
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it("address-less listings fall back to source identity", () => {
    const a = { ...emptyListing("immoscout24"), sourceListingId: "1" };
    const b = { ...emptyListing("immoscout24"), sourceListingId: "2" };
    expect(fingerprint(a)).not.toBe(fingerprint(b));
    expect(fingerprint(a)).toBe(fingerprint({ ...a }));
  });

  it("fuzzy duplicates need matching PLZ, rooms, area and rent", () => {
    const a = { ...emptyListing("a"), postalCode: "13585", rooms: 3, areaSqm: 70, warmRentEur: 1100, title: "Helle 3-Zimmer-Wohnung mit Balkon in Spandau Altstadt" };
    expect(isLikelyDuplicate(a, { ...a, title: "Helle 3-Zimmer-Wohnung mit Balkon in der Spandau Altstadt" })).toBe(true);
    expect(isLikelyDuplicate(a, { ...a, areaSqm: 75 })).toBe(false);
    expect(isLikelyDuplicate(a, { ...a, warmRentEur: 1180 })).toBe(false);
  });
});
