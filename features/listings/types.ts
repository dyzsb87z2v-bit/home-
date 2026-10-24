/**
 * A listing as produced by any source adapter, before persistence.
 * Every field is optional/nullable: unknown facts MUST stay null — never guessed.
 */
export type PropertyType =
  | "APARTMENT"
  | "ROOM"
  | "SHARED_APARTMENT"
  | "HOLIDAY"
  | "DORMITORY"
  | "HOTEL"
  | "OTHER"
  | "UNKNOWN";

export type RentalDuration = "LONG_TERM" | "TEMPORARY" | "UNKNOWN";
export type LocationPrecision = "EXACT" | "APPROXIMATE" | "UNKNOWN";

export interface NormalizedListing {
  sourceSlug: string;
  sourceListingId: string | null;
  url: string | null;
  title: string | null;
  descriptionDe: string | null;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  neighborhood: string | null;
  district: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  locationPrecision: LocationPrecision;
  rooms: number | null;
  areaSqm: number | null;
  coldRentEur: number | null;
  warmRentEur: number | null;
  serviceChargesEur: number | null;
  heatingCostsEur: number | null;
  /** true when the published Nebenkosten explicitly include heating */
  heatingIncluded: boolean | null;
  otherCostsEur: number | null;
  depositText: string | null;
  furnished: boolean | null;
  kitchen: boolean | null;
  balcony: boolean | null;
  terrace: boolean | null;
  elevator: boolean | null;
  floor: string | null;
  accessible: boolean | null;
  availableFrom: string | null; // ISO date
  availableFromText: string | null;
  rentalDuration: RentalDuration;
  wbsRequired: boolean | null;
  cooperativeMembership: string | null;
  propertyType: PropertyType;
  landlordName: string | null;
  contactEmail: string | null;
  contactMethod: string | null;
  publishedAt: string | null; // ISO datetime
  photos: string[];
  /** listing explicitly reported as no longer available */
  unavailable?: boolean;
  raw?: Record<string, unknown>;
}

export function emptyListing(sourceSlug: string): NormalizedListing {
  return {
    sourceSlug,
    sourceListingId: null,
    url: null,
    title: null,
    descriptionDe: null,
    street: null,
    houseNumber: null,
    postalCode: null,
    neighborhood: null,
    district: null,
    city: null,
    latitude: null,
    longitude: null,
    locationPrecision: "UNKNOWN",
    rooms: null,
    areaSqm: null,
    coldRentEur: null,
    warmRentEur: null,
    serviceChargesEur: null,
    heatingCostsEur: null,
    heatingIncluded: null,
    otherCostsEur: null,
    depositText: null,
    furnished: null,
    kitchen: null,
    balcony: null,
    terrace: null,
    elevator: null,
    floor: null,
    accessible: null,
    availableFrom: null,
    availableFromText: null,
    rentalDuration: "UNKNOWN",
    wbsRequired: null,
    cooperativeMembership: null,
    propertyType: "UNKNOWN",
    landlordName: null,
    contactEmail: null,
    contactMethod: null,
    publishedAt: null,
    photos: [],
  };
}
