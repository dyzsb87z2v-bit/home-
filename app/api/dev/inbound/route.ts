import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/database/client";
import { devToolsAllowed } from "@/lib/security/dev-guard";
import { syncEmailAccount } from "@/features/email/sync";
import { deliverTestInbound } from "@/integrations/email/test-provider";

/** DEV/TEST ONLY: simulate a landlord reply to an application and process the mailbox. */
export async function POST(req: Request) {
  if (!devToolsAllowed()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = z.object({ applicationId: z.string().uuid(), subject: z.string(), text: z.string() }).parse(await req.json());
  const db = getDb();
  const [app] = await db.select().from(schema.applications).where(and(eq(schema.applications.id, body.applicationId), eq(schema.applications.userId, user.id)));
  const [acct] = await db.select().from(schema.emailAccounts).where(and(eq(schema.emailAccounts.userId, user.id), eq(schema.emailAccounts.provider, "TEST")));
  if (!app?.providerThreadId || !acct) return NextResponse.json({ error: "application not sent via test mailbox" }, { status: 400 });
  await deliverTestInbound(acct.id, { providerThreadId: app.providerThreadId, from: `Hausverwaltung <${app.recipient}>`, to: acct.emailAddress, subject: body.subject, text: body.text, html: null });
  const r = await syncEmailAccount(acct.id);
  return NextResponse.json({ ok: true, result: r });
}
