import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/database/client";
import { log, recordActivity } from "@/lib/logging";
import { htmlToText } from "@/lib/html";
import { ingestListings } from "@/features/listings/ingest";
import { notify } from "@/features/notifications/service";
import { aiConfigured, classifyReplyAi, translate, AiUnavailableError } from "@/integrations/ai/claude";
import { providerFor } from "@/integrations/email";
import { EmailProviderError, type InboundMessage } from "@/integrations/email/types";
import { parseAlertEmail, patternForSender } from "@/integrations/providers/email-alerts";
import { classifyReplyRules, parseViewingDate, type ReplyCategory } from "./classify";

export function emailAddressOf(from: string): string {
  return (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();
}

const CLOSING: ReplyCategory[] = ["REJECTED", "APARTMENT_RENTED"];

export async function syncEmailAccount(accountId: string) {
  const db = getDb();
  const [account] = await db.select().from(schema.emailAccounts).where(eq(schema.emailAccounts.id, accountId));
  if (!account || account.status !== "CONNECTED") return { skipped: true };
  const userId = account.userId;

  try {
    const provider = providerFor(account);
    const sinceSec = Math.floor(((account.lastSyncAt?.getTime() ?? Date.now() - 7 * 86_400_000) - 3600_000) / 1000);
    const ids = await provider.listMessageIds(`in:inbox after:${sinceSec}`, 100);

    // Skip already-stored messages
    const known = ids.length
      ? await db.select({ id: schema.emailMessages.providerMessageId }).from(schema.emailMessages).innerJoin(schema.emailThreads, eq(schema.emailThreads.id, schema.emailMessages.threadId)).where(and(eq(schema.emailThreads.accountId, account.id), inArray(schema.emailMessages.providerMessageId, ids.map((i) => i.id))))
      : [];
    const knownSet = new Set(known.map((k) => k.id));

    const apps = await db.select().from(schema.applications).where(and(eq(schema.applications.userId, userId), inArray(schema.applications.status, ["SENT", "SUBMITTED_MANUALLY"])));
    const appByThread = new Map(apps.filter((a) => a.providerThreadId).map((a) => [a.providerThreadId!, a]));
    const appByRecipient = new Map(apps.map((a) => [a.recipientNormalized, a]));

    let alerts = 0;
    let replies = 0;
    for (const ref of ids) {
      if (knownSet.has(ref.id)) continue;
      const msg = await provider.getMessage(ref.id);
      const fromAddr = emailAddressOf(msg.from);

      if (patternForSender(fromAddr)) {
        alerts += await handleAlert(userId, account.id, msg);
        continue;
      }
      const app = appByThread.get(msg.providerThreadId) ?? appByRecipient.get(fromAddr);
      if (app) {
        await handleReply(userId, account.id, app, msg);
        replies++;
      }
      // Unrelated mail is neither stored nor processed (data minimization).
    }

    await db.update(schema.emailAccounts).set({ lastSyncAt: new Date(), lastError: null }).where(eq(schema.emailAccounts.id, account.id));
    return { alerts, replies, scanned: ids.length };
  } catch (e) {
    const err = e instanceof EmailProviderError ? e : null;
    const status = err?.code === "EXPIRED" ? "EXPIRED" : "ERROR";
    await db.update(schema.emailAccounts).set({ status: err?.code === "EXPIRED" ? "EXPIRED" : account.status, lastError: String((e as Error).message) }).where(eq(schema.emailAccounts.id, account.id));
    await recordActivity({ userId, action: "email.sync_failed", result: "FAILURE", error: String((e as Error).message), details: { status } });
    if (err?.code === "EXPIRED") await notify(userId, "INTEGRATION_FAILED", `email-expired:${account.id}`, { code: "EMAIL_EXPIRED", title: account.emailAddress }, "/settings");
    throw e;
  }
}

async function storeMessage(accountId: string, msg: InboundMessage, extra: { applicationId?: string | null; propertyId?: string | null; isListingAlert?: boolean; bodyText: string }) {
  const db = getDb();
  const [thread] = await db
    .insert(schema.emailThreads)
    .values({ accountId, providerThreadId: msg.providerThreadId, applicationId: extra.applicationId ?? null, propertyId: extra.propertyId ?? null, subject: msg.subject, lastMessageAt: msg.receivedAt })
    .onConflictDoUpdate({ target: [schema.emailThreads.accountId, schema.emailThreads.providerThreadId], set: { lastMessageAt: msg.receivedAt } })
    .returning();
  const [m] = await db
    .insert(schema.emailMessages)
    .values({
      threadId: thread!.id,
      providerMessageId: msg.providerMessageId,
      direction: "INBOUND",
      fromAddress: emailAddressOf(msg.from),
      toAddress: msg.to,
      subject: msg.subject,
      bodyText: extra.bodyText.slice(0, 50_000),
      isListingAlert: !!extra.isListingAlert,
      receivedAt: msg.receivedAt,
    })
    .onConflictDoNothing()
    .returning();
  return m ?? null;
}

async function handleAlert(userId: string, accountId: string, msg: InboundMessage): Promise<number> {
  const db = getDb();
  const pattern = patternForSender(emailAddressOf(msg.from))!;
  const [source] = await db.select().from(schema.rentalSources).where(eq(schema.rentalSources.slug, pattern.slug));
  if (!source) return 0;
  const [conn] = await db
    .select()
    .from(schema.sourceConnections)
    .where(and(eq(schema.sourceConnections.userId, userId), eq(schema.sourceConnections.sourceId, source.id), eq(schema.sourceConnections.adapter, "email-alerts")));
  if (conn && !conn.enabled) return 0; // user disabled this integration

  const bodyText = msg.text ?? (msg.html ? htmlToText(msg.html) : "");
  const stored = await storeMessage(accountId, msg, { isListingAlert: true, bodyText });
  if (!stored) return 0;
  const listings = parseAlertEmail({ from: msg.from, subject: msg.subject, html: msg.html, text: msg.text, receivedAt: msg.receivedAt.toISOString() });
  const stats = listings.length ? await ingestListings(userId, source.slug, listings) : null;
  const now = new Date();
  if (conn) {
    await db
      .update(schema.sourceConnections)
      .set({ lastSyncAt: now, lastSuccessAt: now, state: "ALERTS_ONLY", lastError: null, consecutiveFailures: 0, listingsFound: conn.listingsFound + (stats?.created ?? 0) })
      .where(eq(schema.sourceConnections.id, conn.id));
  } else {
    await db
      .insert(schema.sourceConnections)
      .values({ userId, sourceId: source.id, adapter: "email-alerts", enabled: true, state: "ALERTS_ONLY", lastSyncAt: now, lastSuccessAt: now, listingsFound: stats?.created ?? 0 })
      .onConflictDoNothing();
  }
  await recordActivity({ userId, action: "source.alert_processed", result: listings.length ? "SUCCESS" : "WARNING", sourceId: source.id, details: { listings: listings.length, created: stats?.created ?? 0, subject: msg.subject.slice(0, 120) } });
  return listings.length;
}

async function handleReply(userId: string, accountId: string, app: typeof schema.applications.$inferSelect, msg: InboundMessage) {
  const db = getDb();
  const bodyText = msg.text ?? (msg.html ? htmlToText(msg.html) : "");
  const stored = await storeMessage(accountId, msg, { applicationId: app.id, propertyId: app.propertyId, bodyText });
  if (!stored) return;

  const rules = classifyReplyRules(msg.subject, bodyText);
  let category: ReplyCategory = rules.category;
  let confidence = rules.confidence;
  let summaryFa: string | null = null;
  let suggestedAction: string | null = null;
  let classifiedBy = "RULES";
  let viewingIso: string | null = null;
  let viewingText = rules.viewingText;
  let location: string | null = null;
  const suspiciousReasons = [...rules.suspiciousReasons];

  if (aiConfigured()) {
    try {
      const ai = await classifyReplyAi(userId, msg.subject, bodyText);
      summaryFa = ai.summaryFa;
      suggestedAction = ai.suggestedActionFa;
      // Deterministic SUSPICIOUS verdicts are never downgraded by the model.
      if (rules.category !== "SUSPICIOUS" && (rules.category === "UNKNOWN" || rules.confidence < 0.7 || ai.confidence > rules.confidence)) {
        category = ai.category;
        confidence = ai.confidence;
        classifiedBy = "AI";
      }
      viewingIso = ai.viewingIsoDateTime;
      viewingText = ai.viewingDateTimeText ?? viewingText;
      location = ai.viewingLocation;
      for (const s of ai.suspiciousSignals) if (!suspiciousReasons.includes(s)) suspiciousReasons.push(s);
    } catch (e) {
      if (!(e instanceof AiUnavailableError)) throw e;
    }
    try {
      const fa = await translate(userId, bodyText.slice(0, 15000), "de", "fa");
      await db.update(schema.emailMessages).set({ bodyFa: fa }).where(eq(schema.emailMessages.id, stored.id));
    } catch (e) {
      if (!(e instanceof AiUnavailableError)) throw e;
    }
  }

  const suspicious = category === "SUSPICIOUS" || suspiciousReasons.length > 0;
  const [reply] = await db
    .insert(schema.landlordReplies)
    .values({ userId, messageId: stored.id, applicationId: app.id, category, confidence, summaryFa, suggestedAction, suspicious, suspiciousReasons, classifiedBy })
    .onConflictDoNothing()
    .returning();
  if (!reply) return;

  if (category === "VIEWING_INVITATION") {
    const at = viewingIso && !isNaN(Date.parse(viewingIso)) ? parseViewingDate(viewingIso.replace(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}).*/, "$3.$2.$1 $4:$5")) : parseViewingDate(viewingText);
    await db.insert(schema.viewingAppointments).values({ userId, applicationId: app.id, replyId: reply.id, proposedAt: at, proposedText: viewingText, location }).onConflictDoNothing();
    await notify(userId, "VIEWING_INVITATION", reply.id, { when: viewingText }, "/viewings");
  } else if (category === "DOCUMENT_REQUEST") {
    await notify(userId, "DOCUMENT_REQUEST", reply.id, { subject: msg.subject }, "/replies");
  } else if (suspicious) {
    await notify(userId, "SUSPICIOUS_MESSAGE", reply.id, { subject: msg.subject }, "/replies");
  } else {
    await notify(userId, "LANDLORD_REPLY", reply.id, { subject: msg.subject, category }, "/replies");
  }

  if (CLOSING.includes(category) || rules.stopContact) {
    await db.update(schema.applications).set({ closed: true }).where(eq(schema.applications.id, app.id));
  }
  if (category === "APARTMENT_RENTED") {
    await db.update(schema.properties).set({ availability: "UNAVAILABLE" }).where(eq(schema.properties.id, app.propertyId));
  }
  await db.insert(schema.applicationEvents).values({ applicationId: app.id, type: "reply_received", payload: { category, classifiedBy, suspicious } });
  await recordActivity({ userId, action: category === "VIEWING_INVITATION" ? "reply.viewing_invitation" : "reply.received", result: suspicious ? "WARNING" : "INFO", propertyId: app.propertyId, applicationId: app.id, details: { category, classifiedBy } });
  log("info", "landlord reply processed", { category, classifiedBy });
}
