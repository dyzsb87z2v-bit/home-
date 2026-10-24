import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/lib/database/client";

export const dynamic = "force-dynamic";

/** Deployment health check: database reachable + background worker heartbeat age. */
export async function GET() {
  try {
    const db = getDb();
    await db.execute(sql`select 1`);
    const [hb] = await db.select().from(schema.systemSettings).where(eq(schema.systemSettings.key, "worker.heartbeat"));
    const at = (hb?.value as { at?: string } | undefined)?.at ?? null;
    const ageSec = at ? Math.round((Date.now() - new Date(at).getTime()) / 1000) : null;
    const workerOk = ageSec != null && ageSec < 900;
    return NextResponse.json({ ok: true, db: "ok", worker: workerOk ? "ok" : "stale", workerHeartbeatAgeSec: ageSec, env: process.env.APP_ENV ?? "development" }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false, db: "error" }, { status: 503 });
  }
}
