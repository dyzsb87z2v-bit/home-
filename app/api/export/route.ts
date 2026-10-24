import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/database/client";
import { audit } from "@/lib/logging";

/** GDPR-style export of the user's own data (documents listed as metadata; secrets excluded). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getDb();
  const uid = user.id;
  const [profile, household, prefs, properties, applications, accounts, docs, replies, viewings, activity] = await Promise.all([
    db.select().from(schema.applicantProfiles).where(eq(schema.applicantProfiles.userId, uid)),
    db.select().from(schema.households).where(eq(schema.households.userId, uid)),
    db.select().from(schema.searchPreferences).where(eq(schema.searchPreferences.userId, uid)),
    db.select().from(schema.properties).where(eq(schema.properties.userId, uid)),
    db.select().from(schema.applications).where(eq(schema.applications.userId, uid)),
    db.select({ id: schema.emailAccounts.id, provider: schema.emailAccounts.provider, emailAddress: schema.emailAccounts.emailAddress, status: schema.emailAccounts.status }).from(schema.emailAccounts).where(eq(schema.emailAccounts.userId, uid)),
    db.select({ id: schema.documents.id, type: schema.documents.type, filename: schema.documents.filename, sizeBytes: schema.documents.sizeBytes, createdAt: schema.documents.createdAt }).from(schema.documents).where(eq(schema.documents.userId, uid)),
    db.select().from(schema.landlordReplies).where(eq(schema.landlordReplies.userId, uid)),
    db.select().from(schema.viewingAppointments).where(eq(schema.viewingAppointments.userId, uid)),
    db.select().from(schema.activityLogs).where(eq(schema.activityLogs.userId, uid)),
  ]);
  const appIds = applications.map((a) => a.id);
  const events = appIds.length ? await db.select().from(schema.applicationEvents).where(inArray(schema.applicationEvents.applicationId, appIds)) : [];
  await audit({ userId: uid, actor: "user", action: "data.exported" });
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), user: { email: user.email, locale: user.locale }, profile, household, prefs, properties, applications, applicationEvents: events, emailAccounts: accounts, documents: docs, replies, viewings, activity }, null, 2);
  return new NextResponse(body, { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="berlin-rent-hunter-export.json"`, "cache-control": "no-store" } });
}
