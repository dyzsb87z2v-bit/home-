import { and, eq, isNull, lt } from "drizzle-orm";
import { getDb, schema } from "@/lib/database/client";
import { log, recordActivity } from "@/lib/logging";
import { runAutopilot } from "@/features/application-management/service";
import { scanFollowUps } from "@/features/application-management/followups";
import { purgeExpiredDocuments } from "@/features/documents/retention";
import { syncEmailAccount } from "@/features/email/sync";
import { dueConnections, runConnectionSync } from "@/features/sources/sync";
import { enqueue, Q } from "./queue";

export async function handleTick() {
  const due = await dueConnections();
  for (const id of due) await enqueue(Q.sourceSync, { connectionId: id }, id);
  return { enqueued: due.length };
}

export async function handleSourceSync(data: { connectionId: string }) {
  const r = await runConnectionSync(data.connectionId);
  if (r.status === "success") {
    for (const id of r.stats.newEligibleIds) await enqueue(Q.processProperty, { propertyId: id }, id);
  }
  return r;
}

export async function handleEmailPoll() {
  const accounts = await getDb().select({ id: schema.emailAccounts.id }).from(schema.emailAccounts).where(eq(schema.emailAccounts.status, "CONNECTED"));
  for (const a of accounts) await enqueue(Q.emailSync, { accountId: a.id }, a.id);
  return { accounts: accounts.length };
}

export async function handleEmailSync(data: { accountId: string }) {
  const r = await syncEmailAccount(data.accountId);
  // Newly eligible listings from alert emails → automation pipeline
  const db = getDb();
  const [acct] = await db.select({ userId: schema.emailAccounts.userId }).from(schema.emailAccounts).where(eq(schema.emailAccounts.id, data.accountId));
  if (acct) {
    const fresh = await db
      .select({ id: schema.properties.id })
      .from(schema.properties)
      .leftJoin(schema.applications, eq(schema.applications.propertyId, schema.properties.id))
      .where(and(eq(schema.properties.userId, acct.userId), eq(schema.properties.eligibility, "ELIGIBLE"), eq(schema.properties.isSample, false), isNull(schema.applications.id)));
    for (const p of fresh) await enqueue(Q.processProperty, { propertyId: p.id }, p.id);
  }
  return r;
}

export async function handleProcessProperty(data: { propertyId: string }) {
  const db = getDb();
  const [p] = await db.select({ userId: schema.properties.userId }).from(schema.properties).where(eq(schema.properties.id, data.propertyId));
  if (!p) return { action: "missing" };
  const r = await runAutopilot(p.userId, data.propertyId);
  if (r.action === "blocked") log("info", "autopilot blocked", { code: r.code });
  return r;
}

export async function handleFollowUpScan() {
  const users = await getDb().select({ id: schema.users.id }).from(schema.users);
  let prepared = 0;
  for (const u of users) prepared += (await scanFollowUps(u.id)).prepared;
  return { prepared };
}

/** Listings not seen by any source for 21 days → availability UNKNOWN (re-verify before applying). */
export async function handleListingExpiry() {
  const cutoff = new Date(Date.now() - 21 * 86_400_000);
  const res = await getDb()
    .update(schema.properties)
    .set({ availability: "UNKNOWN" })
    .where(and(eq(schema.properties.availability, "AVAILABLE"), lt(schema.properties.lastVerifiedAt, cutoff)))
    .returning({ id: schema.properties.id });
  return { expired: res.length };
}

/** Deletes documents past their user-set retention date. */
export async function handleDocumentRetention() {
  return purgeExpiredDocuments();
}

export async function handleHealth() {
  const value = { at: new Date().toISOString(), pid: process.pid };
  await getDb()
    .insert(schema.systemSettings)
    .values({ key: "worker.heartbeat", value })
    .onConflictDoUpdate({ target: schema.systemSettings.key, set: { value, updatedAt: new Date() } });
  return value;
}

export async function handleDeadLetter(job: { id: string; data: unknown }) {
  log("error", "job dead-lettered", { jobId: job.id });
  await recordActivity({ userId: null, action: "job.dead_lettered", result: "FAILURE", details: { jobId: job.id, data: job.data as Record<string, unknown> } });
}
