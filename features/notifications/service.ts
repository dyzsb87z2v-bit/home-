import { eq } from "drizzle-orm";
import webpush from "web-push";
import { getDb, schema } from "@/lib/database/client";
import { log } from "@/lib/logging";

export type NotificationCategory =
  | "NEW_ELIGIBLE"
  | "HIGH_PRIORITY"
  | "APPLICATION_SENT"
  | "LANDLORD_REPLY"
  | "VIEWING_INVITATION"
  | "DOCUMENT_REQUEST"
  | "LISTING_UNAVAILABLE"
  | "INTEGRATION_FAILED"
  | "JOB_FAILING"
  | "SUSPICIOUS_MESSAGE";

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  "NEW_ELIGIBLE",
  "HIGH_PRIORITY",
  "APPLICATION_SENT",
  "LANDLORD_REPLY",
  "VIEWING_INVITATION",
  "DOCUMENT_REQUEST",
  "LISTING_UNAVAILABLE",
  "INTEGRATION_FAILED",
  "JOB_FAILING",
  "SUSPICIOUS_MESSAGE",
];

const DEFAULT_CHANNELS = { inApp: true, push: true, email: false };

let vapidReady: boolean | null = null;
function pushReady() {
  if (vapidReady == null) {
    const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    vapidReady = !!(pub && priv);
    if (vapidReady) webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@localhost", pub!, priv!);
  }
  return vapidReady;
}

/**
 * Creates an in-app notification (deduplicated by dedupeKey) and fans out to push.
 * Payload values are rendered client-side via the `notifications.<category>` message keys,
 * so notifications appear in the user's current language.
 */
export async function notify(userId: string, category: NotificationCategory, dedupeKey: string, payload: Record<string, string | number | null>, link?: string) {
  const db = getDb();
  const [prefs] = await db.select({ p: schema.searchPreferences.notificationPrefs }).from(schema.searchPreferences).where(eq(schema.searchPreferences.userId, userId));
  const channels = { ...DEFAULT_CHANNELS, ...(prefs?.p?.[category] ?? {}) };
  if (!channels.inApp && !channels.push) return null;

  const [n] = await db
    .insert(schema.notifications)
    .values({ userId, category, dedupeKey: `${category}:${dedupeKey}`, payload, link: link ?? null })
    .onConflictDoNothing()
    .returning();
  if (!n) return null; // duplicate

  const delivered: string[] = channels.inApp ? ["inApp"] : [];
  if (channels.push && pushReady()) {
    const subs = await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, userId));
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ id: n.id, category, payload, link: link ?? "/" }),
          { TTL: 3600 },
        );
        if (!delivered.includes("push")) delivered.push("push");
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, s.id));
        else log("warn", "push failed", { status });
      }
    }
  }
  await db.update(schema.notifications).set({ deliveredChannels: delivered }).where(eq(schema.notifications.id, n.id));
  return n;
}
