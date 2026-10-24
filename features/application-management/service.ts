import { createHash } from "node:crypto";
import { and, count, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/database/client";
import { recordActivity, audit, log } from "@/lib/logging";
import { evaluateEligibility, submissionCriteria } from "@/features/matching/eligibility";
import { criteriaFrom, getPreferences } from "@/features/matching/preferences";
import { normalizeRecipient } from "@/features/listings/dedupe";
import { notify } from "@/features/notifications/service";
import { aiConfigured, personalizationSentence, translate, AiUnavailableError } from "@/integrations/ai/claude";
import { providerFor } from "@/integrations/email";
import { EmailProviderError } from "@/integrations/email/types";
import {
  buildApplicationLetter,
  DEFAULT_HOUSEHOLD_PHRASE_DE,
  DEFAULT_HOUSEHOLD_PHRASE_FA,
  validateLetter,
  validatePersonalization,
  type ApplicantFacts,
} from "./letter";

type Application = typeof schema.applications.$inferSelect;
type Property = typeof schema.properties.$inferSelect;

export class SubmissionBlocked extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
  }
}

export async function getApplicantFacts(userId: string): Promise<ApplicantFacts> {
  const db = getDb();
  const [profile] = await db.select().from(schema.applicantProfiles).where(eq(schema.applicantProfiles.userId, userId));
  const [household] = await db.select().from(schema.households).where(eq(schema.households.userId, userId));
  if (!profile || !household) throw new SubmissionBlocked("PROFILE_INCOMPLETE");
  const facts = profile.facts ?? {};
  const verified = Object.entries(facts).filter(([, f]) => f.verified && f.value).map(([k]) => k);
  if (profile.schufaAvailable === "YES") verified.push("schufa");
  return {
    fullName: profile.fullName,
    householdPhraseDe: facts.householdPhraseDe?.value ?? DEFAULT_HOUSEHOLD_PHRASE_DE,
    householdPhraseFa: facts.householdPhraseFa?.value ?? DEFAULT_HOUSEHOLD_PHRASE_FA,
    householdSize: household.adults + household.children,
    monthlyNetIncomeEur: household.monthlyNetIncomeEur,
    verifiedFactKeys: verified,
  };
}

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

export function idempotencyKey(userId: string, propertyId: string, recipient: string) {
  return createHash("sha256").update(`${userId}|${propertyId}|${normalizeRecipient(recipient)}`).digest("hex");
}

async function loadOwnedProperty(userId: string, propertyId: string): Promise<Property> {
  const [p] = await getDb().select().from(schema.properties).where(and(eq(schema.properties.id, propertyId), eq(schema.properties.userId, userId)));
  if (!p) throw new SubmissionBlocked("NOT_FOUND");
  return p;
}

/** Creates (or returns the existing) draft for a property. Never sends. */
export async function createDraft(userId: string, propertyId: string, opts: { useAi?: boolean } = {}): Promise<Application> {
  const db = getDb();
  const property = await loadOwnedProperty(userId, propertyId);
  const applicant = await getApplicantFacts(userId);

  const hasEmail = !!property.contactEmail && EMAIL_RE.test(property.contactEmail);
  const [link] = await db.select().from(schema.propertySourceLinks).where(eq(schema.propertySourceLinks.propertyId, property.id)).limit(1);
  const recipient = hasEmail ? property.contactEmail! : (link?.url ?? `property:${property.id}`);
  const channel = hasEmail ? ("EMAIL" as const) : ("MANUAL" as const);
  const key = idempotencyKey(userId, propertyId, recipient);

  const [existing] = await db.select().from(schema.applications).where(eq(schema.applications.idempotencyKey, key));
  if (existing) return existing;

  let personalization: { de: string; fa: string | null } | null = null;
  let generatedBy = "TEMPLATE";
  if (opts.useAi !== false && aiConfigured() && property.descriptionDe) {
    try {
      const sentence = validatePersonalization(await personalizationSentence(userId, `${property.title ?? ""}\n${property.descriptionDe}`), applicant);
      if (sentence) {
        let fa: string | null = null;
        try {
          fa = await translate(userId, sentence, "de", "fa");
        } catch {
          fa = null;
        }
        personalization = { de: sentence, fa };
        generatedBy = "TEMPLATE+AI";
      }
    } catch (e) {
      if (!(e instanceof AiUnavailableError)) throw e;
      log("info", "ai personalization skipped", { reason: (e as Error).message });
    }
  }

  const letter = buildApplicationLetter(applicant, { ...property, sourceListingId: link?.sourceListingId ?? null }, personalization);
  const validation = validateLetter(letter.bodyDe, applicant);

  const [app] = await db
    .insert(schema.applications)
    .values({
      userId,
      propertyId,
      channel,
      recipient,
      recipientNormalized: normalizeRecipient(recipient),
      subject: letter.subject,
      bodyDe: letter.bodyDe,
      bodyFa: letter.bodyFa,
      generatedBy,
      validation,
      idempotencyKey: key,
      status: "DRAFT",
    })
    .onConflictDoNothing()
    .returning();
  if (!app) {
    const [again] = await db.select().from(schema.applications).where(eq(schema.applications.idempotencyKey, key));
    return again!;
  }
  await db.insert(schema.applicationEvents).values({ applicationId: app.id, type: "draft_created", payload: { generatedBy, validation } });
  await recordActivity({ userId, action: "application.generated", result: validation.ok ? "SUCCESS" : "WARNING", propertyId, applicationId: app.id, details: { channel, generatedBy, issues: validation.issues } });
  return app;
}

/** Updates draft text after user review. Re-validated; resets nothing else. */
export async function updateDraft(userId: string, applicationId: string, subject: string, bodyDe: string) {
  const db = getDb();
  const applicant = await getApplicantFacts(userId);
  const validation = validateLetter(bodyDe, applicant);
  const [u] = await db
    .update(schema.applications)
    .set({ subject: subject.slice(0, 200), bodyDe: bodyDe.slice(0, 5000), validation, generatedBy: "USER_EDITED" })
    .where(and(eq(schema.applications.id, applicationId), eq(schema.applications.userId, userId), inArray(schema.applications.status, ["DRAFT", "FAILED"])))
    .returning();
  if (!u) throw new SubmissionBlocked("NOT_EDITABLE");
  await db.insert(schema.applicationEvents).values({ applicationId, type: "draft_edited", payload: { validation } });
  return u;
}

export type SubmitMode = "USER_APPROVED" | "AUTO";

/**
 * The only path that sends an application. All guards run here, server-side, regardless of caller.
 */
export async function submitApplication(userId: string, applicationId: string, mode: SubmitMode): Promise<Application> {
  const db = getDb();
  const [app] = await db.select().from(schema.applications).where(and(eq(schema.applications.id, applicationId), eq(schema.applications.userId, userId)));
  if (!app) throw new SubmissionBlocked("NOT_FOUND");

  const block = async (code: string, extra: Record<string, unknown> = {}) => {
    await db.insert(schema.applicationEvents).values({ applicationId, type: "submission_blocked", payload: { code, mode, ...extra } });
    await recordActivity({ userId, action: "application.blocked", result: "WARNING", propertyId: app.propertyId, applicationId, details: { code, mode, ...extra } });
    throw new SubmissionBlocked(code);
  };

  if (app.status === "UNCERTAIN") await block("UNCERTAIN_PREVIOUS_ATTEMPT"); // user must resolve manually
  if (!["DRAFT", "FAILED"].includes(app.status)) await block("ALREADY_PROCESSED", { status: app.status });
  if (app.channel !== "EMAIL") await block("CHANNEL_REQUIRES_MANUAL_SUBMISSION");

  // 1–2. Eligibility & availability, re-checked now with the hard €1,200 ceiling.
  const property = await loadOwnedProperty(userId, app.propertyId);
  const prefs = await getPreferences(db, userId);
  const elig = evaluateEligibility({ ...property, unavailable: property.availability === "UNAVAILABLE" }, submissionCriteria(criteriaFrom(prefs)));
  if (elig.eligibility !== "ELIGIBLE") await block("NOT_ELIGIBLE", { eligibility: elig.eligibility, reasons: elig.reasons.map((r) => r.code) });

  // 3. Duplicate protection: any other sent/in-flight application to the same property + recipient
  const dup = await db
    .select({ id: schema.applications.id })
    .from(schema.applications)
    .where(and(eq(schema.applications.userId, userId), eq(schema.applications.propertyId, app.propertyId), eq(schema.applications.recipientNormalized, app.recipientNormalized), inArray(schema.applications.status, ["SENDING", "SENT", "UNCERTAIN", "SUBMITTED_MANUALLY"])));
  if (dup.some((d) => d.id !== app.id)) await block("DUPLICATE");

  // 4. Message accuracy
  const applicant = await getApplicantFacts(userId);
  const validation = validateLetter(app.bodyDe, applicant);
  if (!validation.ok) await block("VALIDATION_FAILED", { issues: validation.issues });

  // 5. Recipient
  if (!EMAIL_RE.test(app.recipient)) await block("INVALID_RECIPIENT");
  const suspicious = await db
    .select({ id: schema.landlordReplies.id })
    .from(schema.landlordReplies)
    .innerJoin(schema.emailMessages, eq(schema.emailMessages.id, schema.landlordReplies.messageId))
    .where(and(eq(schema.landlordReplies.userId, userId), eq(schema.landlordReplies.suspicious, true), eq(schema.emailMessages.fromAddress, app.recipientNormalized)))
    .limit(1);
  if (suspicious.length) await block("SUSPICIOUS_RECIPIENT");

  // 6. Sending authorization
  const [account] = await db
    .select()
    .from(schema.emailAccounts)
    .where(and(eq(schema.emailAccounts.userId, userId), eq(schema.emailAccounts.status, "CONNECTED")))
    .limit(1);
  if (!account) await block("EMAIL_NOT_CONNECTED");
  if (account!.provider === "TEST" && !app.recipient.endsWith(".invalid")) await block("TEST_ACCOUNT_REAL_RECIPIENT");

  if (mode === "AUTO") {
    const auth = prefs.autoApplyAuthorization;
    if (!prefs.autoApplyEnabled || prefs.automationMode !== "AUTO_APPLY" || !auth) await block("AUTO_APPLY_NOT_AUTHORIZED");
    if (auth!.emailAccountId !== account!.id || !auth!.channels.includes("EMAIL")) await block("AUTO_APPLY_SCOPE_MISMATCH");
    if ((property.score ?? 0) < auth!.minScore) await block("BELOW_MIN_SCORE", { score: property.score, min: auth!.minScore });
    const since = new Date(Date.now() - 86_400_000);
    const [{ n }] = (await db
      .select({ n: count() })
      .from(schema.applications)
      .where(and(eq(schema.applications.userId, userId), eq(schema.applications.autoSubmitted, true), gte(schema.applications.submittedAt, since)))) as [{ n: number }];
    if (n >= auth!.maxPerDay) await block("DAILY_LIMIT_REACHED", { limit: auth!.maxPerDay });
  }

  // 8. Atomic claim: only one process can move this application to SENDING.
  const [claimed] = await db
    .update(schema.applications)
    .set({ status: "SENDING", emailAccountId: account!.id, validation })
    .where(and(eq(schema.applications.id, app.id), inArray(schema.applications.status, ["DRAFT", "FAILED"])))
    .returning();
  if (!claimed) await block("CONCURRENT_SUBMISSION");
  await db.insert(schema.applicationEvents).values({ applicationId, type: "sending", payload: { mode, account: account!.emailAddress } });

  // 9. Submit
  try {
    const provider = providerFor(account!);
    const res = await provider.send({ to: app.recipient, subject: app.subject, body: app.bodyDe, idempotencyKey: app.idempotencyKey });
    const now = new Date();
    // 10–12. Provider accepted: store exact content and identifiers
    const [sent] = await db
      .update(schema.applications)
      .set({
        status: "SENT",
        providerMessageId: res.providerMessageId,
        providerThreadId: res.providerThreadId,
        submittedAt: now,
        submittedContent: { to: app.recipient, from: account!.emailAddress, subject: app.subject, body: app.bodyDe },
        autoSubmitted: mode === "AUTO",
        lastError: null,
      })
      .where(eq(schema.applications.id, app.id))
      .returning();
    if (res.providerThreadId) {
      await db
        .insert(schema.emailThreads)
        .values({ accountId: account!.id, providerThreadId: res.providerThreadId, applicationId: app.id, propertyId: app.propertyId, subject: app.subject, lastMessageAt: now })
        .onConflictDoUpdate({ target: [schema.emailThreads.accountId, schema.emailThreads.providerThreadId], set: { applicationId: app.id, propertyId: app.propertyId } });
    }
    await db.insert(schema.applicationEvents).values({ applicationId, type: "sent", payload: { providerMessageId: res.providerMessageId, mode } });
    await recordActivity({ userId, action: "application.submitted", result: "SUCCESS", propertyId: app.propertyId, applicationId, details: { mode, to: app.recipient } });
    await audit({ userId, actor: mode === "AUTO" ? "system:auto-apply" : "user", action: "application.sent", target: app.id, details: { to: app.recipient } });
    await notify(userId, "APPLICATION_SENT", app.id, { title: property.title, to: app.recipient }, `/applications`);
    return sent!;
  } catch (e) {
    const err = e instanceof EmailProviderError ? e : new EmailProviderError("UNCERTAIN", String(e));
    // Timeouts/network errors: the message may have been sent → UNCERTAIN, never auto-retried.
    const uncertain = ["TIMEOUT", "NETWORK", "UNCERTAIN"].includes(err.code);
    const status = uncertain ? "UNCERTAIN" : "FAILED";
    const [failed] = await db.update(schema.applications).set({ status, lastError: `${err.code}: ${err.message}` }).where(eq(schema.applications.id, app.id)).returning();
    if (err.code === "EXPIRED") await db.update(schema.emailAccounts).set({ status: "EXPIRED", lastError: err.message }).where(eq(schema.emailAccounts.id, account!.id));
    await db.insert(schema.applicationEvents).values({ applicationId, type: uncertain ? "send_uncertain" : "send_failed", payload: { code: err.code, message: err.message } });
    await recordActivity({ userId, action: "application.submission_failed", result: "FAILURE", propertyId: app.propertyId, applicationId, error: `${err.code}: ${err.message}` });
    await notify(userId, "INTEGRATION_FAILED", `send:${app.id}:${Date.now()}`, { code: err.code, title: property.title }, `/applications`);
    return failed!;
  }
}

/** For portal/form-only channels: user confirms they submitted it themselves. */
export async function markSubmittedManually(userId: string, applicationId: string) {
  const db = getDb();
  const [u] = await db
    .update(schema.applications)
    .set({ status: "SUBMITTED_MANUALLY", submittedAt: new Date() })
    .where(and(eq(schema.applications.id, applicationId), eq(schema.applications.userId, userId), inArray(schema.applications.status, ["DRAFT", "FAILED", "UNCERTAIN"])))
    .returning();
  if (!u) throw new SubmissionBlocked("NOT_EDITABLE");
  await db.insert(schema.applicationEvents).values({ applicationId, type: "marked_submitted_by_user", payload: {} });
  await recordActivity({ userId, action: "application.marked_submitted", result: "SUCCESS", propertyId: u.propertyId, applicationId });
  return u;
}

/** User resolves an UNCERTAIN send after checking their Sent folder. */
export async function resolveUncertain(userId: string, applicationId: string, wasSent: boolean) {
  const db = getDb();
  const [u] = await db
    .update(schema.applications)
    .set(wasSent ? { status: "SENT", submittedAt: new Date() } : { status: "FAILED" })
    .where(and(eq(schema.applications.id, applicationId), eq(schema.applications.userId, userId), eq(schema.applications.status, "UNCERTAIN")))
    .returning();
  if (!u) throw new SubmissionBlocked("NOT_UNCERTAIN");
  await db.insert(schema.applicationEvents).values({ applicationId, type: "uncertain_resolved", payload: { wasSent } });
  return u;
}

/** Automation pipeline for one property according to the user's mode. */
export async function runAutopilot(userId: string, propertyId: string) {
  const db = getDb();
  const prefs = await getPreferences(db, userId);
  if (prefs.automationMode === "DISCOVERY") return { action: "none" as const };
  const property = await loadOwnedProperty(userId, propertyId);
  if (property.eligibility !== "ELIGIBLE" || property.isSample) return { action: "none" as const };
  const draft = await createDraft(userId, propertyId);
  if (prefs.automationMode === "DRAFTING" || !prefs.autoApplyEnabled) return { action: "drafted" as const, applicationId: draft.id };
  if (draft.status !== "DRAFT" || draft.channel !== "EMAIL") return { action: "drafted" as const, applicationId: draft.id };
  try {
    const sent = await submitApplication(userId, draft.id, "AUTO");
    return { action: sent.status === "SENT" ? ("sent" as const) : ("failed" as const), applicationId: draft.id };
  } catch (e) {
    if (e instanceof SubmissionBlocked) return { action: "blocked" as const, code: e.code, applicationId: draft.id };
    throw e;
  }
}
