import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/database/client";
import { devToolsAllowed } from "@/lib/security/dev-guard";
import { runConnectionSync } from "@/features/sources/sync";

/** DEV/TEST ONLY: attach the synthetic test provider and a simulated mailbox to the current user. */
export async function POST(req: Request) {
  if (!devToolsAllowed()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { action } = z.object({ action: z.enum(["test-provider", "test-email"]) }).parse(await req.json());
  const db = getDb();
  if (action === "test-email") {
    const [a] = await db
      .insert(schema.emailAccounts)
      .values({ userId: user.id, provider: "TEST", emailAddress: "tester@test.invalid", status: "CONNECTED" })
      .onConflictDoUpdate({ target: [schema.emailAccounts.userId, schema.emailAccounts.provider, schema.emailAccounts.emailAddress], set: { status: "CONNECTED" } })
      .returning();
    return NextResponse.json({ ok: true, accountId: a!.id });
  }
  const [src] = await db.select().from(schema.rentalSources).where(eq(schema.rentalSources.slug, "test-provider"));
  if (!src) return NextResponse.json({ error: "test source not seeded" }, { status: 400 });
  await db.insert(schema.sourceConnections).values({ userId: user.id, sourceId: src.id, adapter: "test", enabled: true, intervalMinutes: 60 }).onConflictDoNothing();
  const [c] = await db.select().from(schema.sourceConnections).where(and(eq(schema.sourceConnections.userId, user.id), eq(schema.sourceConnections.sourceId, src.id), eq(schema.sourceConnections.adapter, "test")));
  const r = await runConnectionSync(c!.id);
  return NextResponse.json({ ok: true, result: r });
}
