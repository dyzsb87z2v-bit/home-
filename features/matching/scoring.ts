import type { NormalizedListing } from "@/features/listings/types";

export type AffordabilityTier = "VERY_HIGH" | "HIGH" | "GOOD" | "ACCEPTABLE" | "OVER_BUDGET" | "UNKNOWN";

export function affordabilityTier(warmRentEur: number | null): AffordabilityTier {
  if (warmRentEur == null) return "UNKNOWN";
  if (warmRentEur <= 900) return "VERY_HIGH";
  if (warmRentEur <= 1050) return "HIGH";
  if (warmRentEur <= 1150) return "GOOD";
  if (warmRentEur <= 1200) return "ACCEPTABLE";
  return "OVER_BUDGET";
}

const AFFORDABILITY_POINTS: Record<AffordabilityTier, number> = {
  VERY_HIGH: 40,
  HIGH: 32,
  GOOD: 24,
  ACCEPTABLE: 16,
  OVER_BUDGET: 0,
  UNKNOWN: 0,
};

/** Source reliability weights (0–1). Official landlords > portals > aggregators > temporary platforms. */
const CATEGORY_RELIABILITY: Record<string, number> = {
  PUBLIC_HOUSING: 1,
  COOPERATIVE: 0.95,
  PRIVATE_COMPANY: 0.9,
  PROPERTY_MANAGER: 0.85,
  PORTAL: 0.75,
  AGGREGATOR: 0.6,
  ALERT_SERVICE: 0.6,
  TEMPORARY_FURNISHED: 0.4,
  MANUAL: 0.7,
  TEST: 0.5,
};

export type ScoreInput = Pick<
  NormalizedListing,
  | "warmRentEur"
  | "areaSqm"
  | "rooms"
  | "availableFrom"
  | "availableFromText"
  | "rentalDuration"
  | "postalCode"
  | "street"
  | "descriptionDe"
  | "photos"
  | "contactEmail"
  | "wbsRequired"
> & { sourceCategory?: string | null };

export interface ScoreResult {
  score: number; // 0–100
  tier: AffordabilityTier;
  breakdown: Record<string, number>;
}

function daysUntil(isoDate: string, now: Date) {
  return Math.round((new Date(isoDate + "T00:00:00Z").getTime() - now.getTime()) / 86_400_000);
}

/**
 * Soft ranking among listings. Never used to exclude a listing — eligibility is separate.
 * Weights: affordability 40, availability 15, space 15, long-term 10, completeness 10, reliability 10.
 */
export function scoreListing(l: ScoreInput, now = new Date()): ScoreResult {
  const tier = affordabilityTier(l.warmRentEur);
  const breakdown: Record<string, number> = {};
  breakdown.affordability = AFFORDABILITY_POINTS[tier];

  // Availability: immediately/ASAP or within 30 days scores highest.
  const asap = /sofort|ab sofort|nach vereinbarung|bezugsfrei|umgehend/i.test(l.availableFromText ?? "");
  if (l.availableFrom) {
    const d = daysUntil(l.availableFrom, now);
    breakdown.availability = d <= 30 ? 15 : d <= 60 ? 11 : d <= 90 ? 7 : 3;
  } else breakdown.availability = asap ? 15 : 0;

  // Space: 50 m² → 0 … 90+ m² → 15 ; extra room bonus capped in same budget
  const area = l.areaSqm ?? 0;
  const areaPts = area >= 50 ? Math.min(12, ((area - 50) / 40) * 12) : 0;
  const roomPts = l.rooms != null && l.rooms >= 4 ? 3 : l.rooms != null && l.rooms >= 3 ? 1.5 : 0;
  breakdown.space = Math.round(areaPts + roomPts);

  breakdown.longTerm = l.rentalDuration === "LONG_TERM" ? 10 : l.rentalDuration === "UNKNOWN" ? 4 : 0;

  const completenessFields = [
    l.warmRentEur != null,
    l.areaSqm != null,
    l.rooms != null,
    !!l.postalCode,
    !!l.street,
    !!l.descriptionDe,
    (l.photos?.length ?? 0) > 0,
    !!l.contactEmail,
    l.wbsRequired != null,
    !!(l.availableFrom || l.availableFromText),
  ];
  breakdown.completeness = Math.round((completenessFields.filter(Boolean).length / completenessFields.length) * 10);

  breakdown.reliability = Math.round((CATEGORY_RELIABILITY[l.sourceCategory ?? "PORTAL"] ?? 0.6) * 10);

  const score = Math.max(0, Math.min(100, Object.values(breakdown).reduce((a, b) => a + b, 0)));
  return { score, tier, breakdown };
}
