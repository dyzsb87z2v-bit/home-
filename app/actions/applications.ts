"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/database/client";
import { createDraft, markSubmittedManually, resolveUncertain, submitApplication, SubmissionBlocked, updateDraft } from "@/features/application-management/service";
import { sendFollowUp } from "@/features/application-management/followups";
import type { ActionResult } from "./types";

const uuid = z.string().uuid();

function blocked(e: unknown): ActionResult {
  if (e instanceof SubmissionBlocked) return { ok: false, code: e.code };
  throw e;
}

export async function createDraftAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const app = await createDraft(user.id, uuid.parse(form.get("propertyId")));
    revalidatePath("/", "layout");
    return { ok: true, data: { applicationId: app.id } };
  } catch (e) {
    return blocked(e);
  }
}

export async function updateDraftAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const u = await updateDraft(user.id, uuid.parse(form.get("applicationId")), String(form.get("subject") ?? ""), String(form.get("bodyDe") ?? ""));
    revalidatePath("/", "layout");
    return { ok: !!u.validation?.ok, code: u.validation?.ok ? undefined : "VALIDATION_FAILED", message: u.validation?.issues.join(", ") };
  } catch (e) {
    return blocked(e);
  }
}

/** Explicit, per-application user approval — the confirmation checkbox is required. */
export async function sendApplicationAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (form.get("confirm") !== "on") return { ok: false, code: "confirm_required" };
  try {
    const r = await submitApplication(user.id, uuid.parse(form.get("applicationId")), "USER_APPROVED");
    revalidatePath("/", "layout");
    return { ok: r.status === "SENT", code: r.status, message: r.lastError ?? undefined };
  } catch (e) {
    return blocked(e);
  }
}

export async function markSubmittedAction(form: FormData) {
  const user = await requireUser();
  await markSubmittedManually(user.id, uuid.parse(form.get("applicationId"))).catch(() => null);
  revalidatePath("/", "layout");
}

export async function resolveUncertainAction(form: FormData) {
  const user = await requireUser();
  await resolveUncertain(user.id, uuid.parse(form.get("applicationId")), form.get("wasSent") === "true").catch(() => null);
  revalidatePath("/", "layout");
}

export async function sendFollowUpAction(form: FormData) {
  const user = await requireUser();
  if (form.get("confirm") !== "on") return;
  await sendFollowUp(user.id, uuid.parse(form.get("followUpId")), "USER_APPROVED");
  revalidatePath("/applications");
}

export async function cancelApplicationAction(form: FormData) {
  const user = await requireUser();
  await getDb()
    .update(schema.applications)
    .set({ status: "CANCELLED" })
    .where(and(eq(schema.applications.id, uuid.parse(form.get("applicationId"))), eq(schema.applications.userId, user.id), eq(schema.applications.status, "DRAFT")));
  revalidatePath("/applications");
}
