import boundary from "./data/spandau-boundary.json";

/**
 * Spandau geography.
 * Boundary: Amt für Statistik Berlin-Brandenburg district geometry (CC-BY), via
 * github.com/funkeinteraktiv/Berlin-Geodaten (berlin_bezirke.geojson), WGS84.
 */

/** Postal codes lying entirely inside Bezirk Spandau. */
export const SPANDAU_POSTAL_CODES = new Set([
  "13581", "13583", "13585", "13587", "13589", "13591", "13593", "13595", "13597", "13599", "14089",
]);

/** Postal codes split between Spandau and a neighbouring district — need another signal. */
export const SHARED_POSTAL_CODES = new Map<string, string>([
  ["13629", "Siemensstadt (Spandau) / Charlottenburg-Nord (Charlottenburg-Wilmersdorf)"],
]);

/** Ortsteile of Bezirk Spandau (+ common sub-area names). Lower-case, umlauts kept. */
export const SPANDAU_LOCALITIES = [
  "spandau",
  "altstadt spandau",
  "wilhelmstadt",
  "haselhorst",
  "siemensstadt",
  "staaken",
  "falkenhagener feld",
  "hakenfelde",
  "gatow",
  "kladow",
  "wasserstadt",
  "pichelsdorf",
  "neustadt spandau",
  "gartenfeld",
];

/** Other Berlin Bezirke and well-known Ortsteile, used to reject explicit non-Spandau locations. */
export const OTHER_BERLIN_AREAS = [
  "mitte", "friedrichshain", "kreuzberg", "pankow", "prenzlauer berg", "weißensee", "charlottenburg",
  "wilmersdorf", "westend", "steglitz", "zehlendorf", "tempelhof", "schöneberg", "neukölln", "treptow",
  "köpenick", "marzahn", "hellersdorf", "lichtenberg", "reinickendorf", "tegel", "wedding", "moabit",
  "tiergarten", "gesundbrunnen", "britz", "rudow", "lichterfelde", "dahlem", "wannsee", "frohnau",
  "hermsdorf", "wittenau", "märkisches viertel", "hohenschönhausen", "friedenau", "mariendorf",
  "lankwitz", "adlershof", "grunewald", "halensee", "schmargendorf", "charlottenburg-nord",
];

export type SpandauVerdict = { inSpandau: boolean | null; basis: "COORDINATES" | "POSTAL_CODE" | "LOCALITY" | "NONE"; detail?: string };

type Ring = number[][];
const polygons: Ring[][] = (boundary.features[0]!.geometry.coordinates as unknown as Ring[][]);

function inRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInSpandau(lat: number, lng: number): boolean {
  return polygons.some((poly) => inRing(lng, lat, poly[0]!) && !poly.slice(1).some((hole) => inRing(lng, lat, hole)));
}

function normalizeText(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function mentions(text: string, term: string) {
  // word-boundary match that tolerates umlauts and hyphens
  return new RegExp(`(^|[^\\p{L}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "u").test(text);
}

export function spandauLocalityIn(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = normalizeText(text);
  return SPANDAU_LOCALITIES.find((l) => mentions(t, l)) ?? null;
}

function otherAreaIn(text: string): string | null {
  const t = normalizeText(text);
  return OTHER_BERLIN_AREAS.find((a) => mentions(t, a)) ?? null;
}

/**
 * Deterministic location check. Priority: exact coordinates → postal code → locality names.
 * Approximate coordinates are never used to accept a listing (only exact ones are trusted).
 */
export function checkSpandau(input: {
  latitude: number | null;
  longitude: number | null;
  locationPrecision: "EXACT" | "APPROXIMATE" | "UNKNOWN";
  postalCode: string | null;
  district: string | null;
  neighborhood: string | null;
  city?: string | null;
}): SpandauVerdict {
  if (input.latitude != null && input.longitude != null && input.locationPrecision === "EXACT") {
    return { inSpandau: pointInSpandau(input.latitude, input.longitude), basis: "COORDINATES" };
  }

  const plz = input.postalCode?.trim();
  const areaText = [input.district, input.neighborhood].filter(Boolean).join(" ");
  if (plz && /^\d{5}$/.test(plz)) {
    if (SPANDAU_POSTAL_CODES.has(plz)) return { inSpandau: true, basis: "POSTAL_CODE", detail: plz };
    if (SHARED_POSTAL_CODES.has(plz)) {
      const t = normalizeText(areaText);
      if (mentions(t, "charlottenburg-nord") || mentions(t, "charlottenburg"))
        return { inSpandau: false, basis: "LOCALITY", detail: plz };
      if (spandauLocalityIn(areaText)) return { inSpandau: true, basis: "LOCALITY", detail: plz };
      return { inSpandau: null, basis: "POSTAL_CODE", detail: `shared:${plz}` };
    }
    if (/^1[0-4]\d{3}$/.test(plz)) return { inSpandau: false, basis: "POSTAL_CODE", detail: plz };
    // Non-Berlin postal code (e.g. Falkensee 14612) → outside Spandau
    return { inSpandau: false, basis: "POSTAL_CODE", detail: plz };
  }

  if (areaText) {
    const other = otherAreaIn(areaText);
    const sp = spandauLocalityIn(areaText);
    if (sp && !other) return { inSpandau: true, basis: "LOCALITY", detail: sp };
    if (other && !sp) return { inSpandau: false, basis: "LOCALITY", detail: other };
  }
  return { inSpandau: null, basis: "NONE" };
}
