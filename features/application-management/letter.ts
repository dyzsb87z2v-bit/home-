/**
 * German rental application letters. The base text is the household's approved template;
 * only verified listing facts are inserted. An optional AI sentence must pass validation.
 */

export interface ApplicantFacts {
  fullName: string;
  /** e.g. "gemeinsam mit meiner Partnerin und ihrer 17-jährigen Tochter" */
  householdPhraseDe: string;
  householdPhraseFa: string;
  householdSize: number;
  monthlyNetIncomeEur: number | null;
  /** keys of profile facts the user has marked verified, e.g. "employment", "schufa" */
  verifiedFactKeys: string[];
}

export interface ListingFacts {
  title: string | null;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  rooms: number | null;
  areaSqm: number | null;
  sourceListingId: string | null;
}

export const DEFAULT_HOUSEHOLD_PHRASE_DE = "gemeinsam mit meiner Partnerin und ihrer 17-jährigen Tochter";
export const DEFAULT_HOUSEHOLD_PHRASE_FA = "همراه با همسرم (شریک زندگی‌ام) و دختر ۱۷ سالهٔ او";

const de = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 1 });
const deInt = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 0 });
const faNum = (n: number) => n.toLocaleString("fa-IR", { maximumFractionDigits: 1 });

const NUMBER_WORDS_DE = ["null", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn"];
const NUMBER_WORDS_FA = ["صفر", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه", "ده"];

function address(l: ListingFacts): string | null {
  if (!l.street) return null;
  const line = [l.street, l.houseNumber].filter(Boolean).join(" ");
  return l.postalCode ? `${line}, ${l.postalCode} Berlin` : line;
}

export function buildSubject(l: ListingFacts): string {
  const ref = address(l) ?? l.title?.slice(0, 90) ?? "Ihre Wohnungsanzeige";
  return `Wohnungsanfrage – ${ref}`;
}

function apartmentDescriptionDe(l: ListingFacts): string {
  const parts: string[] = [];
  const kind = l.rooms != null && Number.isInteger(l.rooms) ? `${de(l.rooms)}-Zimmer-Wohnung` : "Wohnung";
  parts.push(`die ${kind}`);
  if (l.areaSqm != null) parts.push(`(ca. ${de(l.areaSqm)} m²)`);
  const addr = address(l);
  if (addr) parts.push(`in der ${addr}`);
  return parts.join(" ");
}

function apartmentDescriptionFa(l: ListingFacts): string {
  const parts: string[] = [];
  parts.push(l.rooms != null && Number.isInteger(l.rooms) ? `آپارتمان ${faNum(l.rooms)} اتاقه` : "آپارتمان");
  if (l.areaSqm != null) parts.push(`(حدود ${faNum(l.areaSqm)} متر مربع)`);
  const addr = address(l);
  if (addr) parts.push(`در ${addr}`);
  return parts.join(" ");
}

export interface Letter {
  subject: string;
  bodyDe: string;
  bodyFa: string;
}

export function buildApplicationLetter(a: ApplicantFacts, l: ListingFacts, personalization?: { de: string; fa: string | null } | null): Letter {
  const sizeDe = NUMBER_WORDS_DE[a.householdSize] ? `${NUMBER_WORDS_DE[a.householdSize]}köpfiger` : `${a.householdSize}-köpfiger`;
  const sizeFa = NUMBER_WORDS_FA[a.householdSize] ?? faNum(a.householdSize);
  const ref = l.sourceListingId ? ` (Anzeigen-/Objektnummer: ${l.sourceListingId})` : "";

  const de: string[] = [
    "Sehr geehrte Damen und Herren,",
    "",
    `mit großem Interesse habe ich Ihre Wohnungsanzeige für ${apartmentDescriptionDe(l)}${ref} gelesen und möchte mich ${a.householdPhraseDe} für die Wohnung bewerben.`,
    "",
    `Wir sind ein ${sizeDe} Haushalt und suchen eine langfristige Wohnung in Berlin-Spandau, in der wir gemeinsam ein Zuhause finden möchten.`,
  ];
  if (personalization?.de) de.push("", personalization.de);
  de.push(
    "",
    (a.monthlyNetIncomeEur != null
      ? `Unser gemeinsames monatliches Haushaltsnettoeinkommen beträgt ca. ${deInt(a.monthlyNetIncomeEur)} Euro. `
      : "") + "Ein Einzug wäre für uns zum nächstmöglichen Zeitpunkt möglich.",
    "",
    "Wir würden uns sehr freuen, wenn Sie uns die Gelegenheit zu einer Besichtigung geben könnten.",
    "",
    "Gerne stellen wir Ihnen im weiteren Bewerbungsverfahren die erforderlichen Unterlagen zur Verfügung.",
    "",
    "Vielen Dank für Ihre Zeit und Ihre Rückmeldung.",
    "",
    "Mit freundlichen Grüßen",
    "",
    a.fullName,
  );

  const fa: string[] = [
    "خانم‌ها و آقایان محترم،",
    "",
    `با علاقهٔ فراوان آگهی شما برای ${apartmentDescriptionFa(l)}${l.sourceListingId ? ` (شمارهٔ آگهی: ${l.sourceListingId})` : ""} را خواندم و مایلم ${a.householdPhraseFa} برای این آپارتمان درخواست بدهم.`,
    "",
    `ما یک خانوار ${sizeFa} نفره هستیم و به دنبال یک آپارتمان بلندمدت در برلین-اشپانداو هستیم تا در آن با هم خانه‌ای بسازیم.`,
  ];
  if (personalization?.de) fa.push("", personalization.fa ?? "(ترجمهٔ این جملهٔ شخصی‌سازی‌شده در دسترس نیست)");
  fa.push(
    "",
    (a.monthlyNetIncomeEur != null ? `درآمد خالص ماهانهٔ مشترک خانوار ما حدود ${faNum(a.monthlyNetIncomeEur)} یورو است. ` : "") +
      "ما می‌توانیم در نزدیک‌ترین زمان ممکن نقل مکان کنیم.",
    "",
    "بسیار خوشحال می‌شویم اگر فرصت بازدید از آپارتمان را به ما بدهید.",
    "",
    "با کمال میل مدارک لازم را در مراحل بعدی درخواست در اختیار شما قرار می‌دهیم.",
    "",
    "از وقت و پاسخ شما سپاسگزاریم.",
    "",
    "با احترام",
    "",
    a.fullName,
  );

  return { subject: buildSubject(l), bodyDe: de.join("\n"), bodyFa: fa.join("\n") };
}

export function buildFollowUpLetter(a: ApplicantFacts, l: ListingFacts, sentAt: Date): Letter {
  const date = sentAt.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
  const dateFa = sentAt.toLocaleDateString("fa-IR", { timeZone: "Europe/Berlin" });
  const bodyDe = [
    "Sehr geehrte Damen und Herren,",
    "",
    `am ${date} hatte ich mich ${a.householdPhraseDe} für ${apartmentDescriptionDe(l)} beworben.`,
    "",
    "Da wir weiterhin großes Interesse an der Wohnung haben, wollte ich freundlich nachfragen, ob sie noch verfügbar ist und ob eine Besichtigung möglich wäre.",
    "",
    "Vielen Dank im Voraus für Ihre Rückmeldung.",
    "",
    "Mit freundlichen Grüßen",
    "",
    a.fullName,
  ].join("\n");
  const bodyFa = [
    "خانم‌ها و آقایان محترم،",
    "",
    `در تاریخ ${dateFa} ${a.householdPhraseFa} برای ${apartmentDescriptionFa(l)} درخواست داده بودم.`,
    "",
    "از آنجا که همچنان علاقهٔ زیادی به این آپارتمان داریم، خواستم مؤدبانه بپرسم که آیا هنوز در دسترس است و آیا امکان بازدید وجود دارد.",
    "",
    "پیشاپیش از پاسخ شما سپاسگزارم.",
    "",
    "با احترام",
    "",
    a.fullName,
  ].join("\n");
  return { subject: `Nachfrage: ${buildSubject(l)}`, bodyDe, bodyFa };
}

// ---------------- Validation ----------------

/** Claims that must not appear unless the matching profile fact is verified. */
const GUARDED_CLAIMS: Array<{ key: string; re: RegExp }> = [
  { key: "schufa", re: /schufa|bonität|kreditwürdig/i },
  { key: "employment", re: /arbeitgeber|angestellt|beschäftigt|arbeitsvertrag|festanstellung|unbefristet(e|en)? (stelle|anstellung|beschäftigung)|beruf/i },
  { key: "guarantee", re: /bürgschaft|bürge/i },
  { key: "references", re: /vermieterbescheinigung|mietschuldenfreiheit|referenz/i },
  { key: "pets", re: /haustier|hund|katze/i },
];

/** Never in an initial inquiry. */
const FORBIDDEN = [/staatsangehörigkeit|nationalität|iran|ungar|herkunft|aufenthalt(stitel|serlaubnis)|visum/i, /anbei|im anhang|beigefügt|angehängt/i];

export interface ValidationResult {
  ok: boolean;
  issues: string[];
}

export function validateLetter(bodyDe: string, a: ApplicantFacts): ValidationResult {
  const issues: string[] = [];
  if (!bodyDe.includes(a.fullName)) issues.push("missing_name");
  if (!/Mit freundlichen Grüßen/.test(bodyDe)) issues.push("missing_closing");
  for (const re of FORBIDDEN) if (re.test(bodyDe)) issues.push(`forbidden:${re.source.slice(0, 20)}`);
  for (const g of GUARDED_CLAIMS) if (g.re.test(bodyDe) && !a.verifiedFactKeys.includes(g.key)) issues.push(`unverified_claim:${g.key}`);
  // Any Euro amount must be the confirmed household income.
  const amounts = [...bodyDe.matchAll(/(\d{1,3}(?:\.\d{3})*(?:,\d+)?)\s*(?:Euro|EUR|€)/g)].map((m) => m[1]);
  const allowed = a.monthlyNetIncomeEur != null ? deInt(a.monthlyNetIncomeEur) : null;
  for (const amt of amounts) if (amt !== allowed) issues.push(`unexpected_amount:${amt}`);
  if (bodyDe.length > 3000) issues.push("too_long");
  return { ok: issues.length === 0, issues };
}

export function validatePersonalization(sentence: string | null | undefined, a: ApplicantFacts): string | null {
  if (!sentence) return null;
  const s = sentence.trim().replace(/\s+/g, " ");
  if (s.length < 10 || s.length > 250) return null;
  if (/\d/.test(s)) return null;
  if (/[<>{}\[\]]|https?:|www\./i.test(s)) return null;
  for (const re of FORBIDDEN) if (re.test(s)) return null;
  for (const g of GUARDED_CLAIMS) if (g.re.test(s) && !a.verifiedFactKeys.includes(g.key)) return null;
  if (/einkommen|gehalt|miete|euro|kaution|zahl/i.test(s)) return null;
  if (!/[.!]$/.test(s)) return null;
  return s;
}
