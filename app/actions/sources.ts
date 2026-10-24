"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/database/client";
import { audit } from "@/lib/logging";
import { feedAdapter } from "@/integrations/providers/feed";
import { enqueue, Q } from "@/jobs/queue";
import type { ActionResult } from "./types";

export async function toggleConnectionAction(form: FormData) {
  const user = await requireUser();
  const id = z.string().uuid().parse(form.get("connectionId"));
  const db = getDb();
  const [c] = await db.select().from(schema.sourceConnections).where(and(eq(schema.sourceConnections.id, id), eq(schema.sourceConnections.userId, user.id)));
  if (!c) return;
  await db.update(schema.sourceConnections).set({ enabled: !c.enabled, state: !c.enabled ? c.state : "DISABLED", nextSyncAt: null }).where(eq(schema.sourceConnections.id, id));
  await audit({ userId: user.id, actor: "user", action: c.enabled ? "source.disabled" : "source.enabled", target: c.sourceId });
  revalidatePath("/sources");
}

const FeedSchema = z.object({ sourceId: z.string().uuid(), url: z.string().url().startsWith("https://"), intervalMinutes: z.coerce.number().int().min(15).max(1440) });

/** Connects an official RSS/Atom/JSON feed URL that the provider publishes. */
export async function addFeedAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const p = FeedSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { ok: false, code: "invalid" };
  try {
    feedAdapter.validateConfig({ url: p.data.url });
  } catch {
    return { ok: false, code: "invalid" };
  }
  const db = getDb();
  const [src] = await db.select().from(schema.rentalSources).where(eq(schema.rentalSources.id, p.data.sourceId));
  if (!src || src.operationalState === "UNAVAILABLE") return { ok: false, code: "unavailable" };
  const [c] = await db
    .insert(schema.sourceConnections)
    .values({ userId: user.id, sourceId: src.id, adapter: "feed", enabled: true, config: { url: p.data.url }, state: "PARTIALLY_CONNECTED", intervalMinutes: Math.max(p.data.intervalMinutes, src.minIntervalMinutes) })
    .onConflictDoUpdate({ target: [schema.sourceConnections.userId, schema.sourceConnections.sourceId, schema.sourceConnections.adapter], set: { config: { url: p.data.url }, enabled: true, intervalMinutes: Math.max(p.data.intervalMinutes, src.minIntervalMinutes), nextSyncAt: null } })
    .returning();
  await enqueue(Q.sourceSync, { connectionId: c!.id }, c!.id).catch(() => null);
  await audit({ userId: user.id, actor: "user", action: "source.feed_added", target: src.id, details: { url: p.data.url } });
  revalidatePath("/sources");
  return { ok: true };
}

export async function syncNowAction(form: FormData) {
  const user = await requireUser();
  const id = z.string().uuid().parse(form.get("connectionId"));
  const [c] = await getDb().select().from(schema.sourceConnections).where(and(eq(schema.sourceConnections.id, id), eq(schema.sourceConnections.userId, user.id)));
  if (!c?.enabled) return;
  // Respect the source's minimum interval even for manual triggers
  const [src] = await getDb().select().from(schema.rentalSources).where(eq(schema.rentalSources.id, c.sourceId));
  if (c.lastSyncAt && src && Date.now() - c.lastSyncAt.getTime() < src.minIntervalMinutes * 60_000 && c.adapter === "feed") return;
  await enqueue(Q.sourceSync, { connectionId: id }, id);
  revalidatePath("/sources");
}
