import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/database/client";
import { recordActivity } from "@/lib/logging";
import { ingestListings, markMissingAsUnavailable } from "@/features/listings/ingest";
import { notify } from "@/features/notifications/service";
import { getAdapter } from "@/integrations/providers";
import { AdapterError } from "@/integrations/providers/types";

const MAX_BACKOFF_MIN = 24 * 60;

/** Next run: the configured interval, never faster than the source allows; exponential backoff on failures. */
export function nextSyncTime(now: Date, intervalMinutes: number, sourceMinInterval: number, consecutiveFailures: number) {
  const base = Math.max(intervalMinutes, sourceMinInterval);
  const backoff = consecutiveFailures > 0 ? Math.min(MAX_BACKOFF_MIN, base * 2 ** consecutiveFailures) : base;
  return new Date(now.getTime() + backoff * 60_000);
}

export async function runConnectionSync(connectionId: string) {
  const db = getDb();
  const [row] = await db
    .select({ c: schema.sourceConnections, s: schema.rentalSources })
    .from(schema.sourceConnections)
    .innerJoin(schema.rentalSources, eq(schema.rentalSources.id, schema.sourceConnections.sourceId))
    .where(eq(schema.sourceConnections.id, connectionId));
  if (!row) return { status: "missing" as const };
  const { c, s } = row;
  const adapter = getAdapter(c.adapter);
  if (!c.enabled || !adapter?.sync || s.operationalState === "UNAVAILABLE" || s.operationalState === "DISABLED") return { status: "skipped" as const };

  const now = new Date();
  const [job] = await db.insert(schema.sourceSyncJobs).values({ connectionId }).returning();
  try {
    adapter.validateConfig(c.config);
    const result = await adapter.sync({ userId: c.userId, sourceSlug: s.slug, config: c.config, lastSuccessAt: c.lastSuccessAt });
    const stats = await ingestListings(c.userId, s.slug, result.listings, { isSample: c.adapter === "test" });
    if (c.adapter === "feed") {
      await markMissingAsUnavailable(c.userId, s.id, result.listings.map((l) => l.sourceListingId).filter((x): x is string => !!x));
    }
    await db.update(schema.sourceSyncJobs).set({ status: "SUCCESS", finishedAt: new Date(), fetched: stats.fetched, created: stats.created, updated: stats.updated }).where(eq(schema.sourceSyncJobs.id, job!.id));
    await db
      .update(schema.sourceConnections)
      .set({
        lastSyncAt: now,
        lastSuccessAt: now,
        lastError: null,
        consecutiveFailures: 0,
        state: "CONNECTED",
        listingsFound: c.listingsFound + stats.created,
        nextSyncAt: nextSyncTime(now, c.intervalMinutes, s.minIntervalMinutes, 0),
      })
      .where(eq(schema.sourceConnections.id, c.id));
    await recordActivity({ userId: c.userId, action: "source.sync_succeeded", result: "SUCCESS", sourceId: s.id, details: { fetched: stats.fetched, created: stats.created, updated: stats.updated } });
    return { status: "success" as const, stats };
  } catch (e) {
    const failures = c.consecutiveFailures + 1;
    const message = e instanceof AdapterError ? `${e.code}: ${e.message}` : String((e as Error).message ?? e);
    await db.update(schema.sourceSyncJobs).set({ status: "FAILED", finishedAt: new Date(), error: message }).where(eq(schema.sourceSyncJobs.id, job!.id));
    const permanent = e instanceof AdapterError && (e.code === "ROBOTS_DISALLOWED" || e.code === "NOT_ALLOWED_IN_PRODUCTION" || e.code === "CONFIG_INVALID");
    await db
      .update(schema.sourceConnections)
      .set({
        lastSyncAt: now,
        lastError: message,
        consecutiveFailures: failures,
        state: permanent ? "UNAVAILABLE" : "PARTIALLY_CONNECTED",
        enabled: permanent ? false : c.enabled,
        nextSyncAt: nextSyncTime(now, c.intervalMinutes, s.minIntervalMinutes, failures),
      })
      .where(eq(schema.sourceConnections.id, c.id));
    await recordActivity({ userId: c.userId, action: "source.sync_failed", result: "FAILURE", sourceId: s.id, error: message, details: { failures } });
    if (failures === 3 || permanent) await notify(c.userId, "INTEGRATION_FAILED", `sync:${c.id}:${failures}`, { title: s.name, code: message.slice(0, 80) }, "/sources");
    // retryable errors are rescheduled via nextSyncAt (backoff), so the job itself completes
    return { status: "failed" as const, error: message };
  }
}

/** Connections due for polling. */
export async function dueConnections(now = new Date()) {
  const db = getDb();
  const rows = await db
    .select({ id: schema.sourceConnections.id, adapter: schema.sourceConnections.adapter, next: schema.sourceConnections.nextSyncAt })
    .from(schema.sourceConnections)
    .where(and(eq(schema.sourceConnections.enabled, true)));
  return rows.filter((r) => getAdapter(r.adapter)?.kind === "polling" && (!r.next || r.next <= now)).map((r) => r.id);
}
