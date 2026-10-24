import { checkSpandau } from "@/features/listings/spandau";
import type { NormalizedListing } from "@/features/listings/types";

export type Eligibility = "ELIGIBLE" | "INELIGIBLE" | "NEEDS_VERIFICATION";

export type ReasonCode =
  | "OUTSIDE_SPANDAU"
  | "LOCATION_UNKNOWN"
  | "LOCATION_OK"
  | "WARM_RENT_TOO_HIGH"
  | "COLD_RENT_ALREADY_TOO_HIGH"
  | "WARM_RENT_UNKNOWN"
  | "WARM_RENT_OK"
  | "ROOMS_TOO_FEW"
  | "ROOMS_UNKNOWN"
  | "ROOMS_OK"
  | "AREA_TOO_SMALL"
  | "AREA_UNKNOWN"
  | "AREA_OK"
  | "NOT_ENTIRE_APARTMENT"
  | "PROPERTY_TYPE_UNKNOWN"
  | "WBS_REQUIRED"
  | "WBS_UNKNOWN"
  | "TEMPORARY_RENTAL"
  | "RENTAL_DURATION_UNKNOWN"
  | "LISTING_UNAVAILABLE";

export type Reason = { code: ReasonCode; params?: Record<string, string | number> };

export interface Criteria {
  district: "Spandau";
  maxWarmRentEur: number;
  minRooms: number;
  minAreaSqm: number;
  requireEntireApartment: boolean;
  excludeWbs: boolean;
  longTermOnly: boolean;
}

/** The household's confirmed hard limits. Editable per user in search_preferences. */
export const DEFAULT_CRITERIA: Criteria = {
  district: "Spandau",
  maxWarmRentEur: 1200,
  minRooms: 3,
  minAreaSqm: 50,
  requireEntireApartment: true,
  excludeWbs: true,
  longTermOnly: true,
};

/**
 * Absolute ceiling: no user setting can raise the auto-apply rent limit above this.
 * (Discovery filters may be edited freely, but submissions re-check against min(user, ceiling).)
 */
export const HARD_WARM_RENT_CEILING_EUR = 1200;

export type EligibilityInput = Pick<
  NormalizedListing,
  | "latitude"
  | "longitude"
  | "locationPrecision"
  | "postalCode"
  | "district"
  | "neighborhood"
  | "city"
  | "rooms"
  | "areaSqm"
  | "coldRentEur"
  | "warmRentEur"
  | "propertyType"
  | "wbsRequired"
  | "rentalDuration"
> & { unavailable?: boolean | null };

export interface EligibilityResult {
  eligibility: Eligibility;
  reasons: Reason[];
}

/**
 * Deterministic eligibility. Any failed hard criterion → INELIGIBLE.
 * Otherwise any unknown hard fact → NEEDS_VERIFICATION. Only all-verified → ELIGIBLE.
 * The language model is never consulted here.
 */
export function evaluateEligibility(l: EligibilityInput, c: Criteria = DEFAULT_CRITERIA): EligibilityResult {
  const failed: Reason[] = [];
  const unknown: Reason[] = [];
  const ok: Reason[] = [];

  if (l.unavailable) failed.push({ code: "LISTING_UNAVAILABLE" });

  // Location
  const loc = checkSpandau(l);
  if (loc.inSpandau === false) failed.push({ code: "OUTSIDE_SPANDAU", params: { basis: loc.basis, detail: loc.detail ?? "" } });
  else if (loc.inSpandau === null) unknown.push({ code: "LOCATION_UNKNOWN" });
  else ok.push({ code: "LOCATION_OK", params: { basis: loc.basis } });

  // Warm rent (never derived from Kaltmiete)
  if (l.warmRentEur != null) {
    if (l.warmRentEur > c.maxWarmRentEur) failed.push({ code: "WARM_RENT_TOO_HIGH", params: { warm: l.warmRentEur, max: c.maxWarmRentEur } });
    else ok.push({ code: "WARM_RENT_OK", params: { warm: l.warmRentEur, max: c.maxWarmRentEur } });
  } else if (l.coldRentEur != null && l.coldRentEur > c.maxWarmRentEur) {
    // Warmmiete is always ≥ Kaltmiete, so this is a certain rejection.
    failed.push({ code: "COLD_RENT_ALREADY_TOO_HIGH", params: { cold: l.coldRentEur, max: c.maxWarmRentEur } });
  } else {
    unknown.push({ code: "WARM_RENT_UNKNOWN" });
  }

  // Rooms
  if (l.rooms == null) unknown.push({ code: "ROOMS_UNKNOWN" });
  else if (l.rooms < c.minRooms) failed.push({ code: "ROOMS_TOO_FEW", params: { rooms: l.rooms, min: c.minRooms } });
  else ok.push({ code: "ROOMS_OK", params: { rooms: l.rooms } });

  // Area
  if (l.areaSqm == null) unknown.push({ code: "AREA_UNKNOWN" });
  else if (l.areaSqm < c.minAreaSqm) failed.push({ code: "AREA_TOO_SMALL", params: { area: l.areaSqm, min: c.minAreaSqm } });
  else ok.push({ code: "AREA_OK", params: { area: l.areaSqm } });

  // Entire apartment
  if (c.requireEntireApartment) {
    if (l.propertyType === "APARTMENT") {
      /* ok */
    } else if (l.propertyType === "UNKNOWN") unknown.push({ code: "PROPERTY_TYPE_UNKNOWN" });
    else failed.push({ code: "NOT_ENTIRE_APARTMENT", params: { type: l.propertyType } });
  }

  // WBS
  if (c.excludeWbs) {
    if (l.wbsRequired === true) failed.push({ code: "WBS_REQUIRED" });
    else if (l.wbsRequired == null) unknown.push({ code: "WBS_UNKNOWN" });
  }

  // Long-term tenancy
  if (c.longTermOnly) {
    if (l.rentalDuration === "TEMPORARY") failed.push({ code: "TEMPORARY_RENTAL" });
    else if (l.rentalDuration === "UNKNOWN") unknown.push({ code: "RENTAL_DURATION_UNKNOWN" });
  }

  if (failed.length) return { eligibility: "INELIGIBLE", reasons: [...failed, ...unknown] };
  if (unknown.length) return { eligibility: "NEEDS_VERIFICATION", reasons: [...unknown, ...ok] };
  return { eligibility: "ELIGIBLE", reasons: ok };
}

/** Criteria used for anything that sends a message: user's limits, clamped by the hard ceiling. */
export function submissionCriteria(c: Criteria): Criteria {
  return { ...c, maxWarmRentEur: Math.min(c.maxWarmRentEur, HARD_WARM_RENT_CEILING_EUR) };
}
