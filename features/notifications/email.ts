import { and, eq } from "drizzle-orm";
import de from "@/messages/de.json";
import fa from "@/messages/fa.json";
import { getDb, schema } from "@/lib/database/client";
import { providerFor } from "@/integrations/email";

const MESSAGES = { de, fa } as const;
const FOOTER = {
  de: "Diese E-Mail wurde von Berlin Rent Hunter AI an Ihre eigene Adresse gesendet. Sie können E-Mail-Benachrichtigungen in den Einstellungen abschalten.",
  fa: "این ایمیل را Berlin Rent Hunter AI به نشانی خود شما فرستاده است. می‌توانید اعلان ایمیلی را در تنظیمات خاموش کنید.",
};

export function renderNotificationText(locale: "de" | "fa", category: string, payload: Record<string, string | number | null>): string {
  const tpl = (MESSAGES[locale].notifications as Record<string, string>)[category] ?? category;
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => (payload[k] == null ? "–" : String(payload[k])));
}

/**
 * Sends a notification to the user's OWN connected mailbox (never to anyone else).
 * Returns false when no connected account exists. Throws provider errors to the caller.
 */
export async function sendNotificationEmail(n: { id: string; userId: string; category: string; payload: Record<string, string | number | null>; link: string | null }): Promise<boolean> {
  const db = getDb();
  const [user] = await db.select({ locale: schema.users.locale }).from(schema.users).where(eq(schema.users.id, n.userId));
  const [account] = await db.select().from(schema.emailAccounts).where(and(eq(schema.emailAccounts.userId, n.userId), eq(schema.emailAccounts.status, "CONNECTED"))).limit(1);
  if (!user || !account) return false;
  const locale = user.locale === "de" ? "de" : "fa";
  const line = renderNotificationText(locale, n.category, n.payload);
  const base = (process.env.APP_URL || "").replace(/\/$/, "");
  const url = base ? `${base}/${locale}${n.link && n.link.startsWith("/") ? n.link : "/notifications"}` : null;
  const body = [line, url ? `\n${url}` : "", `\n\n—\n${FOOTER[locale]}`].join("");
  await providerFor(account).send({ to: account.emailAddress, subject: `[Rent Hunter] ${line}`.slice(0, 180), body, idempotencyKey: `notification:${n.id}` });
  return true;
}
