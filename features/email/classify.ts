/**
 * Deterministic landlord-reply classification and fraud screening.
 * Used first (free, predictable); AI classification is an optional refinement.
 */

export type ReplyCategory =
  | "APPLICATION_RECEIVED"
  | "VIEWING_INVITATION"
  | "MORE_INFO_REQUESTED"
  | "DOCUMENT_REQUEST"
  | "REJECTED"
  | "APARTMENT_RENTED"
  | "ALTERNATIVE_SUGGESTED"
  | "FOLLOW_UP_NEEDED"
  | "SUSPICIOUS"
  | "UNKNOWN";

export interface RuleClassification {
  category: ReplyCategory;
  confidence: number;
  suspiciousReasons: string[];
  stopContact: boolean;
  viewingText: string | null;
}

const RULES: Array<{ category: ReplyCategory; re: RegExp; weight: number }> = [
  { category: "APARTMENT_RENTED", re: /(bereits|schon)\s+(vermietet|vergeben)|nicht mehr (verfügbar|frei)|wohnung ist vergeben|objekt ist vermietet/i, weight: 0.9 },
  { category: "REJECTED", re: /leider\s+(müssen|mussten|können)\s+(wir|ich)\s+(ihnen\s+)?(eine\s+)?absage|absage|nicht berücksichtigen|anderen? (bewerber|interessenten) entschieden|keine besichtigung anbieten|bedauerlicherweise/i, weight: 0.85 },
  { category: "VIEWING_INVITATION", re: /besichtigung(stermin)?\s+(am|findet|ist|wäre|um)|zur besichtigung einladen|einladung zur besichtigung|laden (sie|wir) .{0,40}besichtigung|besichtigungstermin|termin zur besichtigung/i, weight: 0.85 },
  { category: "DOCUMENT_REQUEST", re: /(senden|schicken|reichen|übermitteln)\s+sie\s+(uns\s+)?(bitte\s+)?.{0,60}(unterlagen|schufa|gehaltsnachweis|einkommensnachweis|selbstauskunft|ausweis|mietschuldenfreiheit)|bitte\s+.{0,40}(unterlagen|nachweise)\s+(zu|zukommen)/i, weight: 0.8 },
  { category: "MORE_INFO_REQUESTED", re: /(teilen sie|können sie) (uns )?(bitte )?(mit|sagen)|weitere informationen|rückfragen|beantworten sie|fragebogen|füllen sie .{0,20}aus/i, weight: 0.6 },
  { category: "ALTERNATIVE_SUGGESTED", re: /(andere|weitere|alternative) (wohnung|objekt|angebot)e?n?|könnte(n)? (sie|ihnen) .{0,30}interessieren/i, weight: 0.6 },
  { category: "APPLICATION_RECEIVED", re: /eingang (ihrer|der) (anfrage|bewerbung)|(anfrage|bewerbung|nachricht) (ist )?(bei uns )?eingegangen|vielen dank für ihr(e)? (anfrage|interesse|bewerbung)|automatische antwort|wir melden uns/i, weight: 0.5 },
];

const FRAUD_SIGNALS: Array<{ code: string; re: RegExp }> = [
  { code: "payment_before_viewing", re: /(kaution|miete|anzahlung|vorauszahlung|reservierungsgebühr|gebühr)\s.{0,80}(überweisen|zahlen|bezahlen|vorab)|vor der besichtigung .{0,40}(zahl|überweis)/i },
  { code: "untraceable_payment", re: /western union|moneygram|bitcoin|krypto|crypto|paysafecard|gutschein(karte)?|gift card|airbnb.{0,20}(zahlung|payment)/i },
  { code: "landlord_abroad_keys_by_mail", re: /(im ausland|nicht in (deutschland|berlin))|schlüssel .{0,40}(per post|zuschicken|versenden)/i },
  { code: "id_before_viewing", re: /(ausweis|reisepass|personalausweis|passkopie).{0,60}(vorab|vor der besichtigung|zuerst|schicken)/i },
  { code: "move_to_messenger", re: /whatsapp|telegram|signal\b|viber/i },
  { code: "suspicious_link", re: /https?:\/\/(bit\.ly|tinyurl|t\.co|goo\.gl|rb\.gy|cutt\.ly)|https?:\/\/\d{1,3}(\.\d{1,3}){3}/i },
];

const STOP_CONTACT = /(bitte|sehen sie) (von weiteren|keine weiteren) (anfragen|nachrichten|kontakt)|kontaktieren sie uns nicht|nicht mehr kontaktieren|abmelden|unsubscribe/i;

export function screenFraud(text: string): string[] {
  return FRAUD_SIGNALS.filter((s) => s.re.test(text)).map((s) => s.code);
}

export function classifyReplyRules(subject: string, body: string): RuleClassification {
  const text = `${subject}\n${body}`;
  const suspiciousReasons = screenFraud(text);
  const stopContact = STOP_CONTACT.test(text);

  if (suspiciousReasons.some((r) => r === "payment_before_viewing" || r === "untraceable_payment" || r === "landlord_abroad_keys_by_mail")) {
    return { category: "SUSPICIOUS", confidence: 0.9, suspiciousReasons, stopContact, viewingText: null };
  }

  let best: { category: ReplyCategory; weight: number } = { category: "UNKNOWN", weight: 0 };
  for (const r of RULES) if (r.re.test(text) && r.weight > best.weight) best = r;

  const viewing = text.match(/(?:am|Termin:?)\s+((?:Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag),?\s*(?:den\s+)?)?(\d{1,2}\.\s?\d{1,2}\.(?:\s?\d{2,4})?)(?:[^\n]{0,20}?(\d{1,2}[:.]\d{2})\s*Uhr)?/i);
  const viewingText = best.category === "VIEWING_INVITATION" && viewing ? viewing[0].trim() : null;

  return { category: best.category, confidence: best.weight, suspiciousReasons, stopContact, viewingText };
}

/** Parses "12.11.2026 um 17:30 Uhr" style text into a Berlin-local ISO string (no TZ guessing beyond Europe/Berlin). */
export function parseViewingDate(text: string | null, now = new Date()): Date | null {
  if (!text) return null;
  const m = text.match(/(\d{1,2})\.\s?(\d{1,2})\.(?:\s?(\d{2,4}))?(?:[^\d]{0,20}(\d{1,2})[:.](\d{2}))?/);
  if (!m) return null;
  let year = m[3] ? Number(m[3]) : now.getFullYear();
  if (year < 100) year += 2000;
  const month = Number(m[2]);
  const day = Number(m[1]);
  const hh = m[4] ? Number(m[4]) : 12;
  const mm = m[5] ? Number(m[5]) : 0;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Interpret as Europe/Berlin wall time
  const guessUtc = Date.UTC(year, month - 1, day, hh, mm);
  const offsetMin = berlinOffsetMinutes(new Date(guessUtc));
  let d = new Date(guessUtc - offsetMin * 60_000);
  if (!m[3] && d.getTime() < now.getTime() - 86_400_000 * 30) d = new Date(d.getTime() + 365 * 86_400_000);
  return d;
}

function berlinOffsetMinutes(d: Date): number {
  const s = d.toLocaleString("en-US", { timeZone: "Europe/Berlin", timeZoneName: "shortOffset" });
  const m = s.match(/GMT([+-]\d+)(?::(\d+))?/);
  if (!m) return 60;
  return Number(m[1]) * 60 + (m[2] ? Math.sign(Number(m[1])) * Number(m[2]) : 0);
}
