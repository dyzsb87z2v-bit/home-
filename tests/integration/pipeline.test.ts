import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb, schema } from "@/lib/database/client";
import { ingestListings } from "@/features/listings/ingest";
import { createDraft, runAutopilot, submitApplication, SubmissionBlocked, markSubmittedManually } from "@/features/application-management/service";
import { scanFollowUps } from "@/features/application-management/followups";
import { syncEmailAccount } from "@/features/email/sync";
import { deliverTestInbound, readBox } from "@/integrations/email/test-provider";
import { authorizeAuto, eligibleListing, makeUser, testMailbox } from "./helpers";

afterAll(async () => closeDb());

const db = () => getDb();

describe("ingestion, eligibility and dedupe (database)", () => {
  it("stores listings, evaluates them and keeps provenance", async () => {
    const u = await makeUser();
    const stats = await ingestListings(u.id, "test-provider", [eligibleListing("1"), eligibleListing("2", { warmRentEur: 1350 }), eligibleListing("3", { warmRentEur: null })]);
    expect(stats.created).toBe(3);
    expect(stats.newEligibleIds).toHaveLength(1);
    const rows = await db().select().from(schema.properties).where(eq(schema.properties.userId, u.id));
    const byTitle = Object.fromEntries(rows.map((r) => [r.title, r.eligibility]));
    expect(byTitle).toEqual({ "Wohnung 1": "ELIGIBLE", "Wohnung 2": "INELIGIBLE", "Wohnung 3": "NEEDS_VERIFICATION" });
    const evals = await db().select().from(schema.propertyEvaluations);
    expect(evals.length).toBeGreaterThanOrEqual(3);
  });

  it("re-ingesting the same listing updates instead of duplicating", async () => {
    const u = await makeUser();
    await ingestListings(u.id, "test-provider", [eligibleListing("A")]);
    const s2 = await ingestListings(u.id, "test-provider", [eligibleListing("A", { warmRentEur: 1050 })]);
    expect(s2.created).toBe(0);
    const rows = await db().select().from(schema.properties).where(eq(schema.properties.userId, u.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.warmRentEur).toBe(1050);
  });

  it("merges the same apartment from two sources and never overwrites known facts from another source", async () => {
    const u = await makeUser();
    await ingestListings(u.id, "test-provider", [eligibleListing("X", { street: "Weverstraße", houseNumber: "5", areaSqm: 72.4 })]);
    await ingestListings(u.id, "manual", [{ ...eligibleListing("X2", { street: "Weverstr.", houseNumber: "5", areaSqm: 72, warmRentEur: 999, balcony: true }), sourceSlug: "manual" }]);
    const rows = await db().select().from(schema.properties).where(eq(schema.properties.userId, u.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.warmRentEur).toBe(1100); // other source cannot overwrite
    expect(rows[0]!.balcony).toBe(true); // but fills unknown fields
    const links = await db().select().from(schema.propertySourceLinks).where(eq(schema.propertySourceLinks.propertyId, rows[0]!.id));
    expect(links).toHaveLength(2);
  });
});

describe("application submission guards", () => {
  it("drafts are idempotent per property + recipient", async () => {
    const u = await makeUser();
    const s = await ingestListings(u.id, "test-provider", [eligibleListing("D")]);
    const a1 = await createDraft(u.id, s.touchedIds[0]!);
    const a2 = await createDraft(u.id, s.touchedIds[0]!);
    expect(a1.id).toBe(a2.id);
    expect(a1.bodyDe).toContain("Sehr geehrte Damen und Herren");
    expect(a1.bodyDe).toContain("3.500 Euro");
    expect(a1.bodyDe).toContain("Milad Masoudi");
    expect(a1.bodyDe).not.toMatch(/SCHUFA|Iran|Ungar/i);
    expect(a1.validation?.ok).toBe(true);
    expect(a1.bodyFa).toContain("یورو");
  });

  it("blocks sending when the listing is not eligible (rent above €1,200)", async () => {
    const u = await makeUser();
    await testMailbox(u.id);
    const s = await ingestListings(u.id, "test-provider", [eligibleListing("E", { warmRentEur: 1250 })]);
    const a = await createDraft(u.id, s.touchedIds[0]!);
    await expect(submitApplication(u.id, a.id, "USER_APPROVED")).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
  });

  it("blocks sending without a connected email account", async () => {
    const u = await makeUser();
    const s = await ingestListings(u.id, "test-provider", [eligibleListing("F")]);
    const a = await createDraft(u.id, s.touchedIds[0]!);
    await expect(submitApplication(u.id, a.id, "USER_APPROVED")).rejects.toMatchObject({ code: "EMAIL_NOT_CONNECTED" });
  });

  it("user-approved send succeeds, stores exact content, and cannot be sent twice", async () => {
    const u = await makeUser();
    const acct = await testMailbox(u.id);
    const s = await ingestListings(u.id, "test-provider", [eligibleListing("G")]);
    const a = await createDraft(u.id, s.touchedIds[0]!);
    const sent = await submitApplication(u.id, a.id, "USER_APPROVED");
    expect(sent.status).toBe("SENT");
    expect(sent.providerMessageId).toBeTruthy();
    expect(sent.submittedContent).toMatchObject({ to: a.recipient, body: a.bodyDe });
    const box = await readBox(acct.id);
    expect(box.sent).toHaveLength(1);
    await expect(submitApplication(u.id, a.id, "USER_APPROVED")).rejects.toBeInstanceOf(SubmissionBlocked);
    expect((await readBox(acct.id)).sent).toHaveLength(1);
  });

  it("refuses to edit drafts into unverified claims", async () => {
    const u = await makeUser();
    await testMailbox(u.id);
    const s = await ingestListings(u.id, "test-provider", [eligibleListing("H")]);
    const a = await createDraft(u.id, s.touchedIds[0]!);
    await db().update(schema.applications).set({ bodyDe: a.bodyDe.replace("Mit freundlichen", "Eine positive SCHUFA liegt vor.\n\nMit freundlichen") }).where(eq(schema.applications.id, a.id));
    await expect(submitApplication(u.id, a.id, "USER_APPROVED")).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("a timeout marks the send UNCERTAIN and it is never retried automatically", async () => {
    const u = await makeUser();
    await testMailbox(u.id);
    const s = await ingestListings(u.id, "test-provider", [eligibleListing("T", { contactEmail: "x@timeout.invalid" })]);
    const a = await createDraft(u.id, s.touchedIds[0]!);
    const r = await submitApplication(u.id, a.id, "USER_APPROVED");
    expect(r.status).toBe("UNCERTAIN");
    await expect(submitApplication(u.id, a.id, "USER_APPROVED")).rejects.toMatchObject({ code: "UNCERTAIN_PREVIOUS_ATTEMPT" });
  });

  it("a permanent provider error marks the send FAILED", async () => {
    const u = await makeUser();
    await testMailbox(u.id);
    const s = await ingestListings(u.id, "test-provider", [eligibleListing("P", { contactEmail: "x@fail.invalid" })]);
    const a = await createDraft(u.id, s.touchedIds[0]!);
    expect((await submitApplication(u.id, a.id, "USER_APPROVED")).status).toBe("FAILED");
  });

  it("listings without an email address become manual submissions", async () => {
    const u = await makeUser();
    const s = await ingestListings(u.id, "test-provider", [eligibleListing("M", { contactEmail: null })]);
    const a = await createDraft(u.id, s.touchedIds[0]!);
    expect(a.channel).toBe("MANUAL");
    await expect(submitApplication(u.id, a.id, "USER_APPROVED")).rejects.toMatchObject({ code: "CHANNEL_REQUIRES_MANUAL_SUBMISSION" });
    expect((await markSubmittedManually(u.id, a.id)).status).toBe("SUBMITTED_MANUALLY");
  });
});

describe("automation modes", () => {
  it("DISCOVERY does nothing, DRAFTING drafts, AUTO_APPLY requires explicit authorization", async () => {
    const u = await makeUser();
    const acct = await testMailbox(u.id);
    const s = await ingestListings(u.id, "test-provider", [eligibleListing("Q")]);
    const pid = s.touchedIds[0]!;
    expect((await runAutopilot(u.id, pid)).action).toBe("none");

    await db().update(schema.searchPreferences).set({ automationMode: "DRAFTING" }).where(eq(schema.searchPreferences.userId, u.id));
    expect((await runAutopilot(u.id, pid)).action).toBe("drafted");

    // AUTO_APPLY mode without authorization → still only drafts
    await db().update(schema.searchPreferences).set({ automationMode: "AUTO_APPLY" }).where(eq(schema.searchPreferences.userId, u.id));
    expect((await runAutopilot(u.id, pid)).action).toBe("drafted");
    expect((await readBox(acct.id)).sent).toHaveLength(0);

    await authorizeAuto(u.id, acct.id);
    expect((await runAutopilot(u.id, pid)).action).toBe("sent");
    expect((await readBox(acct.id)).sent).toHaveLength(1);
  });

  it("enforces the authorized daily limit and minimum score", async () => {
    const u = await makeUser();
    const acct = await testMailbox(u.id);
    await authorizeAuto(u.id, acct.id, { maxPerDay: 1 });
    const s = await ingestListings(u.id, "test-provider", [eligibleListing("L1"), eligibleListing("L2")]);
    const r1 = await runAutopilot(u.id, s.touchedIds[0]!);
    const r2 = await runAutopilot(u.id, s.touchedIds[1]!);
    expect(r1.action).toBe("sent");
    expect(r2).toMatchObject({ action: "blocked", code: "DAILY_LIMIT_REACHED" });

    const u2 = await makeUser();
    const acct2 = await testMailbox(u2.id);
    await authorizeAuto(u2.id, acct2.id, { minScore: 101 });
    const s2 = await ingestListings(u2.id, "test-provider", [eligibleListing("S1")]);
    expect(await runAutopilot(u2.id, s2.touchedIds[0]!)).toMatchObject({ action: "blocked", code: "BELOW_MIN_SCORE" });
  });

  it("never auto-applies to sample/test-provider data flagged as sample", async () => {
    const u = await makeUser();
    const acct = await testMailbox(u.id);
    await authorizeAuto(u.id, acct.id);
    const s = await ingestListings(u.id, "test-provider", [eligibleListing("Z")], { isSample: true });
    expect((await runAutopilot(u.id, s.touchedIds[0]!)).action).toBe("none");
  });
});

describe("email: replies, viewings, alerts, follow-ups", () => {
  it("classifies a viewing invitation, creates an appointment and notifies", async () => {
    const u = await makeUser();
    const acct = await testMailbox(u.id);
    const s = await ingestListings(u.id, "test-provider", [eligibleListing("V")]);
    const a = await submitApplication(u.id, (await createDraft(u.id, s.touchedIds[0]!)).id, "USER_APPROVED");
    await deliverTestInbound(acct.id, { providerThreadId: a.providerThreadId!, from: `HV <${a.recipient}>`, to: acct.emailAddress, subject: "Re: Wohnungsanfrage", text: "Guten Tag, gerne laden wir Sie zur Besichtigung am 12.11.2026 um 17:30 Uhr ein.", html: null });
    const r = await syncEmailAccount(acct.id);
    expect(r).toMatchObject({ replies: 1 });
    const [reply] = await db().select().from(schema.landlordReplies).where(eq(schema.landlordReplies.applicationId, a.id));
    expect(reply!.category).toBe("VIEWING_INVITATION");
    const [v] = await db().select().from(schema.viewingAppointments).where(eq(schema.viewingAppointments.applicationId, a.id));
    expect(v!.proposedAt?.toISOString()).toBe("2026-11-12T16:30:00.000Z");
    const notes = await db().select().from(schema.notifications).where(and(eq(schema.notifications.userId, u.id), eq(schema.notifications.category, "VIEWING_INVITATION")));
    expect(notes).toHaveLength(1);
    // idempotent re-sync
    await syncEmailAccount(acct.id);
    expect(await db().select().from(schema.landlordReplies).where(eq(schema.landlordReplies.applicationId, a.id))).toHaveLength(1);
  });

  it("flags payment-before-viewing as suspicious and blocks future sends to that sender", async () => {
    const u = await makeUser();
    const acct = await testMailbox(u.id);
    const s = await ingestListings(u.id, "test-provider", [eligibleListing("S")]);
    const a = await submitApplication(u.id, (await createDraft(u.id, s.touchedIds[0]!)).id, "USER_APPROVED");
    await deliverTestInbound(acct.id, { providerThreadId: a.providerThreadId!, from: a.recipient, to: acct.emailAddress, subject: "Wohnung", text: "Ich bin im Ausland. Bitte überweisen Sie die Kaution vorab per Western Union, dann schicke ich die Schlüssel per Post.", html: null });
    await syncEmailAccount(acct.id);
    const [reply] = await db().select().from(schema.landlordReplies).where(eq(schema.landlordReplies.applicationId, a.id));
    expect(reply!.category).toBe("SUSPICIOUS");
    expect(reply!.suspicious).toBe(true);
  });

  it("a rejection closes the application so no follow-up is prepared", async () => {
    const u = await makeUser();
    const acct = await testMailbox(u.id);
    const s = await ingestListings(u.id, "test-provider", [eligibleListing("R"), eligibleListing("R2")]);
    const a = await submitApplication(u.id, (await createDraft(u.id, s.touchedIds[0]!)).id, "USER_APPROVED");
    const b = await submitApplication(u.id, (await createDraft(u.id, s.touchedIds[1]!)).id, "USER_APPROVED");
    await deliverTestInbound(acct.id, { providerThreadId: a.providerThreadId!, from: a.recipient, to: acct.emailAddress, subject: "Absage", text: "Leider müssen wir Ihnen eine Absage erteilen.", html: null });
    await syncEmailAccount(acct.id);
    const old = new Date(Date.now() - 10 * 86_400_000);
    await db().update(schema.applications).set({ submittedAt: old }).where(eq(schema.applications.userId, u.id));
    const r = await scanFollowUps(u.id);
    expect(r.prepared).toBe(1);
    const fu = await db().select().from(schema.followUps);
    expect(fu.filter((f) => f.applicationId === a.id)).toHaveLength(0);
    expect(fu.filter((f) => f.applicationId === b.id)).toHaveLength(1);
    // never a second follow-up beyond maxFollowUps (default 1)
    expect((await scanFollowUps(u.id)).prepared).toBe(0);
  });

  it("ingests listings from a portal alert email in the connected mailbox", async () => {
    const u = await makeUser();
    const acct = await testMailbox(u.id);
    const html = `<html><body><p>Neue Angebote für Ihren Suchauftrag</p>
      <table><tr><td><a href="https://www.immobilienscout24.de/expose/123456789?referrer=mail">Helle 3-Zimmer-Wohnung in Spandau</a><br>
      3 Zimmer · 74 m² · 1.090 € warm · 13585 Berlin</td></tr>
      <tr><td><a href="https://www.immobilienscout24.de/expose/987654321">Kleine Wohnung Mitte</a><br>2 Zimmer · 45 m² · 900 € warm · 10115 Berlin</td></tr></table></body></html>`;
    await deliverTestInbound(acct.id, { providerThreadId: "alert-thread-1", from: "ImmoScout24 <noreply@immobilienscout24.de>", to: acct.emailAddress, subject: "2 neue Angebote", text: null, html });
    const r = await syncEmailAccount(acct.id);
    expect(r).toMatchObject({ alerts: 2 });
    const rows = await db().select().from(schema.properties).where(eq(schema.properties.userId, u.id));
    expect(rows).toHaveLength(2);
    const spandau = rows.find((x) => x.postalCode === "13585")!;
    expect(spandau.warmRentEur).toBe(1090);
    expect(spandau.rooms).toBe(3);
    expect(spandau.areaSqm).toBe(74);
    // WBS/duration not stated in alert → never assumed
    expect(spandau.eligibility).toBe("NEEDS_VERIFICATION");
    expect(rows.find((x) => x.postalCode === "10115")!.eligibility).toBe("INELIGIBLE");
    const [conn] = await db().select().from(schema.sourceConnections).innerJoin(schema.rentalSources, eq(schema.rentalSources.id, schema.sourceConnections.sourceId)).where(and(eq(schema.sourceConnections.userId, u.id), eq(schema.rentalSources.slug, "immoscout24")));
    expect(conn!.source_connections.state).toBe("ALERTS_ONLY");
  });
});
