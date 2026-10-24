import { SPANDAU_LOCALITIES } from "./spandau";
import type { NormalizedListing, PropertyType, RentalDuration } from "./types";

/**
 * Deterministic extraction of German listing facts from free text.
 * Only explicit statements are extracted; anything ambiguous stays null.
 */

/** Parses German/English formatted numbers: "1.150,50" → 1150.5, "1,150.50" → 1150.5, "72,5" → 72.5 */
export function parseGermanNumber(raw: string): number | null {
  let s = raw.trim().replace(/\s/g, "").replace(/[€]/g, "");
  if (!s) return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (hasComma) {
    s = s.replace(",", "."); // German decimal comma
  } else if (hasDot) {
    // "1.150" (thousands) vs "72.5" (decimal)
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  }
  s = s.replace(/[,-]+$/, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const NUM = String.raw`(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)`;
const EUR = String.raw`(?:€|EUR|Euro)`;

function money(text: string, labels: string[]): number | null {
  for (const label of labels) {
    const re1 = new RegExp(`${label}[^\\d\\n]{0,40}?${NUM}\\s*(?:,-\\s*)?${EUR}?`, "iu");
    const m = text.match(re1);
    if (m?.[1]) {
      const v = parseGermanNumber(m[1]);
      if (v != null && v > 0 && v < 20000) return v;
    }
  }
  return null;
}

/** "850 € Kaltmiete", "1.150 € warm" — amount before the label. */
function moneyBefore(text: string, labels: string[]): number | null {
  for (const label of labels) {
    const m = text.match(new RegExp(`${NUM}\\s*${EUR}\\s*(?:\\(|·|\\|)?\\s*${label}`, "iu"));
    if (m?.[1]) {
      const v = parseGermanNumber(m[1]);
      if (v != null && v > 0 && v < 20000) return v;
    }
  }
  return null;
}

function firstNumber(text: string, re: RegExp): number | null {
  const m = text.match(re);
  return m?.[1] ? parseGermanNumber(m[1]) : null;
}

export function extractRooms(text: string): number | null {
  const v =
    firstNumber(text, new RegExp(`${NUM}\\s*(?:-\\s*)?(?:Zimmer|Zi\\.|Raum|Räume|Zimmerwohnung|Zi-Whg|ZKB)`, "iu")) ??
    firstNumber(text, new RegExp(`Zimmer(?:anzahl)?\\s*:?\\s*${NUM}`, "iu"));
  return v != null && v > 0 && v < 15 ? v : null;
}

export function extractArea(text: string): number | null {
  const v =
    firstNumber(text, new RegExp(`(?:Wohnfläche|Fläche)\\s*(?:ca\\.?|circa|etwa)?\\s*:?\\s*${NUM}\\s*(?:m²|m2|qm|m\\^2)`, "iu")) ??
    firstNumber(text, new RegExp(`(?:ca\\.?\\s*)?${NUM}\\s*(?:m²|m2|qm)`, "iu"));
  return v != null && v >= 10 && v < 1000 ? v : null;
}

export function extractPostalCode(text: string): string | null {
  const m = text.match(/\b(1[0-4]\d{3}|1[45]\d{3})\s+Berlin\b/u) ?? text.match(/\bBerlin[\s,-]+(1[0-4]\d{3})\b/u) ?? text.match(/\b(1[34]5\d{2}|13629|14089)\b/u);
  return m?.[1] ?? null;
}

export function extractWbs(text: string): boolean | null {
  const t = text.toLowerCase();
  if (/(kein|ohne)\s+wbs|wbs\s+(ist\s+)?nicht\s+(erforderlich|notwendig|nötig)|wbs:\s*nein|kein\s+wohnberechtigungsschein|ohne\s+wohnberechtigungsschein|wbs\s+nicht\s+benötigt/.test(t)) return false;
  if (/wbs\s*(\d+\s*)?(erforderlich|notwendig|nötig|benötigt|pflicht|vorausgesetzt)|mit\s+wbs|nur\s+mit\s+wbs|wbs[-\s]?(pflichtig|gebunden)|wohnberechtigungsschein\s+(ist\s+)?(erforderlich|notwendig|benötigt)|wbs:\s*ja|wbs\s*\d{2,3}\b/.test(t)) return true;
  return null;
}

export function extractPropertyType(text: string): PropertyType {
  const t = text.toLowerCase();
  if (/\bwg[-\s]?zimmer\b|zimmer in (einer )?wg|mitbewohner|wohngemeinschaft/.test(t)) return "SHARED_APARTMENT";
  if (/ferienwohnung|ferienapartment|urlaubs?wohnung|holiday/.test(t)) return "HOLIDAY";
  if (/studentenwohnheim|wohnheim|dormitory/.test(t)) return "DORMITORY";
  if (/\bhotel\b|boardinghouse|monteurzimmer/.test(t)) return "HOTEL";
  if (/möbliertes zimmer|zimmer zur untermiete|einzelzimmer/.test(t)) return "ROOM";
  if (/(\d|drei|vier|fünf)[-\s]?zimmer[-\s]?wohnung|wohnung|etagenwohnung|dachgeschoss|maisonette|erdgeschosswohnung|apartment|altbauwohnung|neubauwohnung/.test(t)) return "APARTMENT";
  return "UNKNOWN";
}

export function extractRentalDuration(text: string): RentalDuration {
  const t = text.toLowerCase();
  if (/zwischenmiete|befristet(?!e[rn]?\s+staffel)|auf zeit|möbliert auf zeit|max(imal)?\.?\s*\d+\s*monate|temporary|kurzzeit/.test(t) && !/unbefristet/.test(t)) return "TEMPORARY";
  if (/unbefristet|langfristig|dauerhaft/.test(t)) return "LONG_TERM";
  return "UNKNOWN";
}

function bool(text: string, positive: RegExp, negative?: RegExp): boolean | null {
  if (negative?.test(text)) return false;
  if (positive.test(text)) return true;
  return null;
}

const MONTHS: Record<string, number> = { januar: 1, februar: 2, märz: 3, maerz: 3, april: 4, mai: 5, juni: 6, juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12 };

export function extractAvailability(text: string): { date: string | null; text: string | null } {
  const m = text.match(/(?:frei|bezugsfrei|verfügbar|einzug|bezugsfertig)\s*(?:ab|zum|:)?\s*:?\s*(\d{1,2}\.\s?\d{1,2}\.\s?\d{2,4}|[^\n.;,]{2,40})/iu);
  const phrase = m?.[1]?.trim() ?? null;
  if (/sofort/i.test(text) && /(ab|frei|einzug|verfügbar)\s*(:\s*)?sofort/i.test(text)) return { date: null, text: "sofort" };
  if (!phrase) return { date: null, text: null };
  const d = phrase.match(/(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{2,4})/);
  if (d) {
    const year = d[3]!.length === 2 ? 2000 + Number(d[3]) : Number(d[3]);
    const iso = `${year}-${String(d[2]).padStart(2, "0")}-${String(d[1]).padStart(2, "0")}`;
    return { date: isNaN(Date.parse(iso)) ? null : iso, text: phrase };
  }
  const mm = phrase.toLowerCase().match(/(januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\s+(\d{4})/);
  if (mm) return { date: `${mm[2]}-${String(MONTHS[mm[1]!]).padStart(2, "0")}-01`, text: phrase };
  return { date: null, text: phrase };
}

export function extractEmail(text: string): string | null {
  const m = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m?.[0]?.toLowerCase() ?? null;
}

/**
 * Warmmiete rules: explicit "Warmmiete"/"Gesamtmiete"/"Bruttowarmmiete" wins.
 * Otherwise Kaltmiete + Nebenkosten + Heizkosten only when heating is published
 * (as separate amount, or Nebenkosten explicitly "inkl. Heizkosten"). Never guessed.
 */
export function deriveWarmRent(p: {
  explicitWarm: number | null;
  cold: number | null;
  service: number | null;
  heating: number | null;
  heatingIncluded: boolean | null;
  other: number | null;
}): number | null {
  if (p.explicitWarm != null) return p.explicitWarm;
  if (p.cold == null || p.service == null) return null;
  if (p.heating != null) return round2(p.cold + p.service + p.heating + (p.other ?? 0));
  if (p.heatingIncluded === true) return round2(p.cold + p.service + (p.other ?? 0));
  return null;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function parseListingText(text: string): Partial<NormalizedListing> {
  const explicitWarm =
    money(text, ["Warmmiete", "Gesamtmiete", "Bruttowarmmiete", "Miete warm", "warm\\s*:", "Gesamtkosten"]) ??
    moneyBefore(text, ["Warmmiete", "warm\\b", "Gesamtmiete"]);
  const cold =
    money(text, ["Kaltmiete", "Nettokaltmiete", "Grundmiete", "Miete kalt", "kalt\\s*:"]) ??
    moneyBefore(text, ["Kaltmiete", "kalt\\b", "Nettokaltmiete"]);
  const service = money(text, ["Nebenkosten", "Betriebskosten", "Vorauszahlung Betriebskosten"]);
  const heating = money(text, ["Heizkosten", "Heizkostenvorauszahlung"]);
  const heatingIncluded = /(nebenkosten|betriebskosten)[^\n]{0,30}(inkl\.?|inklusive|einschl\.?)\s*heiz/i.test(text)
    ? true
    : /heizkosten\s*(in nebenkosten\s*)?enthalten/i.test(text)
      ? true
      : null;
  const avail = extractAvailability(text);
  const plz = extractPostalCode(text);
  const locality = SPANDAU_LOCALITIES.find((l) => text.toLowerCase().includes(l)) ?? null;

  return {
    rooms: extractRooms(text),
    areaSqm: extractArea(text),
    coldRentEur: cold,
    serviceChargesEur: service,
    heatingCostsEur: heating,
    heatingIncluded,
    warmRentEur: deriveWarmRent({ explicitWarm, cold, service, heating, heatingIncluded, other: null }),
    depositText: text.match(/Kaution\s*:?\s*([^\n]{2,60})/i)?.[1]?.trim() ?? null,
    postalCode: plz,
    neighborhood: locality ? locality.replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : null,
    wbsRequired: extractWbs(text),
    propertyType: extractPropertyType(text),
    rentalDuration: extractRentalDuration(text),
    furnished: bool(text, /\bmöbliert\b|furnished/i, /\bunmöbliert\b|nicht möbliert/i),
    kitchen: bool(text, /einbauküche|\bEBK\b|küche vorhanden/i),
    balcony: bool(text, /balkon|loggia/i, /kein balkon|ohne balkon/i),
    terrace: bool(text, /terrasse/i),
    elevator: bool(text, /aufzug|fahrstuhl|lift\b/i, /kein (aufzug|fahrstuhl)/i),
    accessible: bool(text, /barrierefrei|rollstuhlgerecht/i),
    floor: text.match(/(\d{1,2})\.\s*(?:OG|Obergeschoss|Etage|Stock)/i)?.[1] ?? (/\b(EG|Erdgeschoss)\b/.test(text) ? "0" : null),
    availableFrom: avail.date,
    availableFromText: avail.text,
    contactEmail: extractEmail(text),
    cooperativeMembership: /genossenschaftsanteil|mitgliedschaft|geschäftsanteil/i.test(text)
      ? (text.match(/[^\n.]*(genossenschaftsanteil|geschäftsanteil|mitgliedschaft)[^\n.]*/i)?.[0]?.trim() ?? null)
      : null,
  };
}
