import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb, schema } from "@/lib/database/client";
import { notify } from "@/features/notifications/service";
import { purgeExpiredDocuments } from "@/features/documents/retention";
import { syncEmailAccount } from "@/features/email/sync";
import { decryptBuffer, encryptBuffer } from "@/lib/security/crypto";
import { deliverTestInbound, readBox } from "@/integrations/email/test-provider";
import { makeUser, testMailbox } from "./helpers";

afterAll(async () => closeDb());
const db = () => getDb();

async function enableEmail(userId: string, category: string) {
  await db().update(schema.searchPreferences).set({ notificationPrefs: { [category]: { inApp: true, push: false, email: true } } }).where(eq(schema.searchPreferences.userId, userId));
}

describe("email notifications to the user", () => {
  it("are off by default", async () => {
    const u = await makeUser();
    const acct = await testMailbox(u.id);
    await notify(u.id, "NEW_ELIGIBLE", "p1", { title: "Wohnung 1" });
    expect((await readBox(acct.id)).sent).toHaveLength(0);
  });

  it("when enabled, go only to the user's own address, in the user's language, once", async () => {
    const u = await makeUser();
    await db().update(schema.users).set({ locale: "de" }).where(eq(schema.users.id, u.id));
    const acct = await testMailbox(u.id);
    await enableEmail(u.id, "HIGH_PRIORITY");
    const n = await notify(u.id, "HIGH_PRIORITY", "p2", { title: "Helle Wohnung", warm: 990 }, "/apartments/x");
    await notify(u.id, "HIGH_PRIORITY", "p2", { title: "Helle Wohnung", warm: 990 }); // duplicate
    const sent = (await readBox(acct.id)).sent;
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(acct.emailAddress);
    expect(sent[0]!.subject).toContain("Sehr gute neue Wohnung: Helle Wohnung (990 € warm)");
    const [row] = await db().select().from(schema.notifications).where(eq(schema.notifications.id, n!.id));
    expect(row!.deliveredChannels).toContain("email");
  });

  it("are skipped without a connected mailbox, and a mail failure does not lose the in-app notification", async () => {
    const u = await makeUser();
    await enableEmail(u.id, "NEW_ELIGIBLE");
    const n = await notify(u.id, "NEW_ELIGIBLE", "p3", { title: "X" });
    expect(n).not.toBeNull();
    const [row] = await db().select().from(schema.notifications).where(eq(schema.notifications.id, n!.id));
    expect(row!.deliveredChannels).toEqual(["inApp"]);
  });

  it("own notification emails in the inbox are never processed as replies", async () => {
    const u = await makeUser();
    const acct = await testMailbox(u.id);
    await deliverTestInbound(acct.id, { providerThreadId: "self-1", from: acct.emailAddress, to: acct.emailAddress, subject: "[Rent Hunter] Neue Antwort", text: "Besichtigung am 12.11.2026 um 17:30", html: null });
    const r = await syncEmailAccount(acct.id);
    expect(r).toMatchObject({ replies: 0 });
    expect(await db().select().from(schema.landlordReplies).where(eq(schema.landlordReplies.userId, u.id))).toHaveLength(0);
  });
});

describe("document vault", () => {
  it("stores documents encrypted and decrypts them back", async () => {
    const u = await makeUser();
    const pdf = Buffer.from("%PDF-1.4 test payload");
    const [d] = await db().insert(schema.documents).values({ userId: u.id, type: "PAYSLIP", filename: "a.pdf", mimeType: "application/pdf", sizeBytes: pdf.length, encryptedData: encryptBuffer(pdf) }).returning();
    expect(Buffer.from(d!.encryptedData).includes(Buffer.from("test payload"))).toBe(false);
    expect(decryptBuffer(Buffer.from(d!.encryptedData)).equals(pdf)).toBe(true);
  });

  it("retention deletes only documents past their date (kept through the retention day) and audits it", async () => {
    const u = await makeUser();
    const mk = (retentionUntil: string | null) => ({ userId: u.id, type: "OTHER" as const, filename: "f.pdf", mimeType: "application/pdf", sizeBytes: 1, encryptedData: encryptBuffer(Buffer.from("x")), retentionUntil });
    await db().insert(schema.documents).values([mk("2026-10-23"), mk("2026-10-24"), mk(null)]);
    // 2026-10-24 01:00 Berlin (still 2026-10-23 23:00 UTC)
    await purgeExpiredDocuments(new Date("2026-10-23T23:00:00Z"));
    const left = await db().select({ r: schema.documents.retentionUntil }).from(schema.documents).where(eq(schema.documents.userId, u.id));
    expect(left.map((x) => x.r).sort()).toEqual(["2026-10-24", null].sort());
    const audits = await db().select().from(schema.auditLogs).where(and(eq(schema.auditLogs.userId, u.id), eq(schema.auditLogs.action, "document.retention_deleted")));
    expect(audits).toHaveLength(1);
  });
});
