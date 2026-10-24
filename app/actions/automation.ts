"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clientIp, requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/database/client";
import { audit, recordActivity } from "@/lib/logging";
import type { ActionResult } from "./types";

export async function setModeAction(form: FormData) {
  const user = await requireUser();
  const mode = z.enum(["DISCOVERY", "DRAFTING", "AUTO_APPLY"]).parse(form.get("mode"));
  const db = getDb();
  const [prefs] = await db.select().from(schema.searchPreferences).where(eq(schema.searchPreferences.userId, user.id));
  // AUTO_APPLY as a mode only takes effect once authorized; switching away always disables sending.
  await db
    .update(schema.searchPreferences)
    .set({ automationMode: mode, autoApplyEnabled: mode === "AUTO_APPLY" ? !!prefs?.autoApplyAuthorization && prefs.autoApplyEnabled : false })
    .where(eq(schema.searchPreferences.userId, user.id));
  await recordActivity({ userId: user.id, action: "automation.changed", result: "INFO", details: { mode } });
  await audit({ userId: user.id, actor: "user", action: "automation.mode", details: { mode } });
  revalidatePath("/", "layout");
}

const AuthSchema = z.object({
  emailAccountId: z.string().uuid(),
  maxPerDay: z.coerce.number().int().min(1).max(30),
  minScore: z.coerce.number().int().min(0).max(100),
  confirm: z.literal("on"),
});

/** Explicit, scoped authorization for AUTO-APPLY. Recorded verbatim in the audit log. */
export async function authorizeAutoApplyAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const p = AuthSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { ok: false, code: "confirm_required" };
  const db = getDb();
  const [account] = await db.select().from(schema.emailAccounts).where(and(eq(schema.emailAccounts.id, p.data.emailAccountId), eq(schema.emailAccounts.userId, user.id), eq(schema.emailAccounts.status, "CONNECTED")));
  if (!account) return { ok: false, code: "EMAIL_NOT_CONNECTED" };
  const authorization = {
    authorizedAt: new Date().toISOString(),
    emailAccountId: account.id,
    channels: ["EMAIL" as const],
    maxPerDay: p.data.maxPerDay,
    minScore: p.data.minScore,
    onlyEligible: true as const,
    statement: `User authorized automatic German rental applications from ${account.emailAddress} by email only, to listings classified ELIGIBLE (Spandau, ≤ €1,200 Warmmiete, ≥3 rooms, ≥50 m², no WBS, entire apartment, long-term), max ${p.data.maxPerDay}/24h, min score ${p.data.minScore}, never with attachments.`,
  };
  await db.update(schema.searchPreferences).set({ automationMode: "AUTO_APPLY", autoApplyEnabled: true, autoApplyAuthorization: authorization }).where(eq(schema.searchPreferences.userId, user.id));
  await audit({ userId: user.id, actor: "user", action: "automation.auto_apply_authorized", ip: await clientIp(), details: authorization });
  await recordActivity({ userId: user.id, action: "automation.changed", result: "INFO", details: { autoApply: true } });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setAutoApplyAction(form: FormData) {
  const user = await requireUser();
  const on = form.get("on") === "true";
  const db = getDb();
  const [prefs] = await db.select().from(schema.searchPreferences).where(eq(schema.searchPreferences.userId, user.id));
  if (on && !prefs?.autoApplyAuthorization) return; // must authorize first
  await db.update(schema.searchPreferences).set({ autoApplyEnabled: on, ...(on ? { automationMode: "AUTO_APPLY" as const } : {}) }).where(eq(schema.searchPreferences.userId, user.id));
  await audit({ userId: user.id, actor: "user", action: on ? "automation.auto_apply_on" : "automation.auto_apply_paused" });
  await recordActivity({ userId: user.id, action: "automation.changed", result: "INFO", details: { autoApply: on } });
  revalidatePath("/", "layout");
}

export async function revokeAutoApplyAction() {
  const user = await requireUser();
  await getDb().update(schema.searchPreferences).set({ autoApplyEnabled: false, autoApplyAuthorization: null, automationMode: "DRAFTING", autoFollowUp: false }).where(eq(schema.searchPreferences.userId, user.id));
  await audit({ userId: user.id, actor: "user", action: "automation.auto_apply_revoked" });
  revalidatePath("/", "layout");
}

const FollowSchema = z.object({ followUpAfterDays: z.coerce.number().int().min(2).max(30), maxFollowUps: z.coerce.number().int().min(0).max(3), autoFollowUp: z.string().optional() });

export async function saveFollowUpAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const p = FollowSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { ok: false, code: "invalid" };
  await getDb().update(schema.searchPreferences).set({ followUpAfterDays: p.data.followUpAfterDays, maxFollowUps: p.data.maxFollowUps, autoFollowUp: !!p.data.autoFollowUp }).where(eq(schema.searchPreferences.userId, user.id));
  revalidatePath("/automation");
  return { ok: true };
}
