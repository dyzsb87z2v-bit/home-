import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { getDb, schema } from "@/lib/database/client";
import { recordActivity } from "@/lib/logging";
import { getPreferences } from "@/features/matching/preferences";
import { providerFor } from "@/integrations/email";
import { EmailProviderError } from "@/integrations/email/types";
import { buildFollowUpLetter } from "./letter";
import { getApplicantFacts } from "./service";

/**
 * Prepares (and, if authorized, sends) polite follow-ups for unanswered applications.
 * Never after a rejection, rental notice or stop-contact request (application.closed),
 * never after any landlord reply, and never more than maxFollowUps.
 */
export async function scanFollowUps(userId: string, now = new Date()) {
  const db = getDb();
  const prefs = await getPreferences(db, userId);
  if (prefs.maxFollowUps <= 0) return { prepared: 0, sent: 0 };
  const cutoff = new Date(now.getTime() - prefs.followUpAfterDays * 86_400_000);

  const candidates = await db
    .select()
    .from(schema.applications)
    .where(and(eq(schema.applications.userId, userId), eq(schema.applications.status, "SENT"), eq(schema.applications.closed, false), isNotNull(schema.applications.submittedAt), lt(schema.applications.submittedAt, cutoff)));

  let prepared = 0;
  let sent = 0;
  for (const app of candidates) {
    if (app.followUpCount >= prefs.maxFollowUps) continue;
    if (app.lastFollowUpAt && app.lastFollowUpAt > cutoff) continue;
    const replies = await db.select({ id: schema.landlordReplies.id }).from(schema.landlordReplies).where(eq(schema.landlordReplies.applicationId, app.id)).limit(1);
    if (replies.length) continue;
    const [property] = await db.select().from(schema.properties).where(eq(schema.properties.id, app.propertyId));
    if (!property || property.availability === "UNAVAILABLE") continue;

    const seq = app.followUpCount + 1;
    const existing = await db.select().from(schema.followUps).where(and(eq(schema.followUps.applicationId, app.id), eq(schema.followUps.sequence, seq)));
    let followUp = existing[0];
    if (!followUp) {
      const letter = buildFollowUpLetter(await getApplicantFacts(userId), { ...property, sourceListingId: null }, app.submittedAt!);
      [followUp] = await db.insert(schema.followUps).values({ applicationId: app.id, sequence: seq, bodyDe: letter.bodyDe, bodyFa: letter.bodyFa }).onConflictDoNothing().returning();
      if (!followUp) continue;
      prepared++;
      await recordActivity({ userId, action: "followup.prepared", result: "INFO", propertyId: app.propertyId, applicationId: app.id, details: { sequence: seq } });
    }

    const autoOk = prefs.autoFollowUp && prefs.autoApplyEnabled && prefs.automationMode === "AUTO_APPLY" && !!prefs.autoApplyAuthorization;
    if (autoOk && followUp.status === "DRAFT") {
      if (await sendFollowUp(userId, followUp.id, "AUTO")) sent++;
    }
  }
  return { prepared, sent };
}

export async function sendFollowUp(userId: string, followUpId: string, mode: "AUTO" | "USER_APPROVED"): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ f: schema.followUps, a: schema.applications })
    .from(schema.followUps)
    .innerJoin(schema.applications, eq(schema.applications.id, schema.followUps.applicationId))
    .where(and(eq(schema.followUps.id, followUpId), eq(schema.applications.userId, userId)));
  if (!row || row.a.closed || row.a.status !== "SENT" || !row.a.emailAccountId) return false;
  const [claimed] = await db.update(schema.followUps).set({ status: "SENDING" }).where(and(eq(schema.followUps.id, followUpId), inArray(schema.followUps.status, ["DRAFT", "FAILED"]))).returning();
  if (!claimed) return false;
  const [account] = await db.select().from(schema.emailAccounts).where(eq(schema.emailAccounts.id, row.a.emailAccountId));
  try {
    if (!account || account.status !== "CONNECTED") throw new EmailProviderError("AUTH", "email not connected");
    const res = await providerFor(account).send({ to: row.a.recipient, subject: `Re: ${row.a.subject}`, body: row.f.bodyDe, idempotencyKey: `${row.a.idempotencyKey}:fu${row.f.sequence}`, threadId: row.a.providerThreadId });
    const now = new Date();
    await db.update(schema.followUps).set({ status: "SENT", sentAt: now, providerMessageId: res.providerMessageId }).where(eq(schema.followUps.id, followUpId));
    await db.update(schema.applications).set({ followUpCount: row.f.sequence, lastFollowUpAt: now }).where(eq(schema.applications.id, row.a.id));
    await db.insert(schema.applicationEvents).values({ applicationId: row.a.id, type: "followup_sent", payload: { sequence: row.f.sequence, mode } });
    await recordActivity({ userId, action: "followup.sent", result: "SUCCESS", propertyId: row.a.propertyId, applicationId: row.a.id, details: { mode } });
    return true;
  } catch (e) {
    const err = e instanceof EmailProviderError ? e : new EmailProviderError("UNCERTAIN", String(e));
    const uncertain = ["TIMEOUT", "NETWORK", "UNCERTAIN"].includes(err.code);
    await db.update(schema.followUps).set({ status: uncertain ? "UNCERTAIN" : "FAILED", lastError: err.message }).where(eq(schema.followUps.id, followUpId));
    await recordActivity({ userId, action: "followup.failed", result: "FAILURE", propertyId: row.a.propertyId, applicationId: row.a.id, error: err.message });
    return false;
  }
}
