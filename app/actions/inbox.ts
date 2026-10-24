"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/database/client";
import { audit } from "@/lib/logging";
import { enqueue, Q } from "@/jobs/queue";

export async function markReplyHandledAction(form: FormData) {
  const user = await requireUser();
  const id = z.string().uuid().parse(form.get("replyId"));
  await getDb().update(schema.landlordReplies).set({ handled: true }).where(and(eq(schema.landlordReplies.id, id), eq(schema.landlordReplies.userId, user.id)));
  revalidatePath("/replies");
}

export async function setViewingStatusAction(form: FormData) {
  const user = await requireUser();
  const id = z.string().uuid().parse(form.get("viewingId"));
  const status = z.enum(["ACCEPTED_BY_USER", "DECLINED", "PROPOSED"]).parse(form.get("status"));
  await getDb().update(schema.viewingAppointments).set({ status }).where(and(eq(schema.viewingAppointments.id, id), eq(schema.viewingAppointments.userId, user.id)));
  revalidatePath("/viewings");
}

export async function syncEmailNowAction() {
  const user = await requireUser();
  const accounts = await getDb().select().from(schema.emailAccounts).where(and(eq(schema.emailAccounts.userId, user.id), eq(schema.emailAccounts.status, "CONNECTED")));
  for (const a of accounts) await enqueue(Q.emailSync, { accountId: a.id }, a.id);
  revalidatePath("/inbox");
}

export async function disconnectEmailAction(form: FormData) {
  const user = await requireUser();
  const id = z.string().uuid().parse(form.get("accountId"));
  const db = getDb();
  await db.update(schema.emailAccounts).set({ status: "DISCONNECTED", encryptedRefreshToken: null }).where(and(eq(schema.emailAccounts.id, id), eq(schema.emailAccounts.userId, user.id)));
  // Disconnecting the account always stops automatic sending
  await db.update(schema.searchPreferences).set({ autoApplyEnabled: false, autoApplyAuthorization: null }).where(eq(schema.searchPreferences.userId, user.id));
  await audit({ userId: user.id, actor: "user", action: "email.disconnected", target: id });
  revalidatePath("/", "layout");
}

export async function markAllNotificationsReadAction() {
  const user = await requireUser();
  await getDb().update(schema.notifications).set({ readAt: new Date() }).where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)));
  revalidatePath("/", "layout");
}

export async function deleteAccountAction(form: FormData) {
  const user = await requireUser();
  if (form.get("confirm") !== "DELETE") return;
  await audit({ userId: null, actor: "user", action: "account.deleted", target: user.id });
  // Cascades remove all user-owned rows (properties, applications, documents, email, logs)
  await getDb().delete(schema.users).where(eq(schema.users.id, user.id));
  const { destroySession } = await import("@/lib/auth");
  await destroySession().catch(() => null);
  const { redirect } = await import("next/navigation");
  redirect("/login");
}
