"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/database/client";
import { recordActivity } from "@/lib/logging";
import { ingestListings } from "@/features/listings/ingest";
import { reevaluateOne } from "@/features/listings/reevaluate";
import { aiConfigured, extractListingFacts, translate, AiUnavailableError } from "@/integrations/ai/claude";
import { listingFromText } from "@/integrations/providers/listing-from-text";
import { enqueue, Q } from "@/jobs/queue";
import type { ActionResult } from "./types";

async function owned(userId: string, propertyId: string) {
  const [p] = await getDb().select().from(schema.properties).where(and(eq(schema.properties.id, propertyId), eq(schema.properties.userId, userId)));
  return p ?? null;
}

export async function toggleSavedAction(form: FormData) {
  const user = await requireUser();
  const id = z.string().uuid().parse(form.get("propertyId"));
  const p = await owned(user.id, id);
  if (!p) return;
  await getDb().update(schema.properties).set({ saved: !p.saved }).where(eq(schema.properties.id, id));
  revalidatePath("/", "layout");
}

export async function hideAction(form: FormData) {
  const user = await requireUser();
  const id = z.string().uuid().parse(form.get("propertyId"));
  if (!(await owned(user.id, id))) return;
  await getDb().update(schema.properties).set({ hidden: true }).where(eq(schema.properties.id, id));
  revalidatePath("/", "layout");
}

const tri = z.enum(["", "true", "false"]).optional();
const ConfirmSchema = z.object({
  propertyId: z.string().uuid(),
  warmRentEur: z.string().optional(),
  rooms: z.string().optional(),
  areaSqm: z.string().optional(),
  postalCode: z.string().regex(/^(\d{5})?$/).optional(),
  wbsRequired: tri,
  rentalDuration: z.enum(["", "LONG_TERM", "TEMPORARY"]).optional(),
  propertyType: z.enum(["", "APARTMENT", "ROOM", "SHARED_APARTMENT", "HOLIDAY", "DORMITORY", "HOTEL", "OTHER"]).optional(),
  contactEmail: z.string().email().or(z.literal("")).optional(),
});

const num = (s: string | undefined) => {
  if (!s?.trim()) return undefined;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** User-confirmed facts from the original listing (explicitly entered, audit-logged). */
export async function confirmFactsAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const p = ConfirmSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { ok: false, code: "invalid" };
  const prop = await owned(user.id, p.data.propertyId);
  if (!prop) return { ok: false, code: "NOT_FOUND" };
  const patch: Partial<typeof schema.properties.$inferInsert> = {};
  const warm = num(p.data.warmRentEur);
  if (warm) patch.warmRentEur = warm;
  const rooms = num(p.data.rooms);
  if (rooms) patch.rooms = rooms;
  const area = num(p.data.areaSqm);
  if (area) patch.areaSqm = area;
  if (p.data.postalCode) patch.postalCode = p.data.postalCode;
  if (p.data.wbsRequired) patch.wbsRequired = p.data.wbsRequired === "true";
  if (p.data.rentalDuration) patch.rentalDuration = p.data.rentalDuration;
  if (p.data.propertyType) patch.propertyType = p.data.propertyType;
  if (p.data.contactEmail) patch.contactEmail = p.data.contactEmail.toLowerCase();
  if (!Object.keys(patch).length) return { ok: false, code: "nothing" };
  await getDb().update(schema.properties).set(patch).where(eq(schema.properties.id, prop.id));
  const r = await reevaluateOne(user.id, prop.id);
  await recordActivity({ userId: user.id, action: "listing.facts_confirmed", result: "INFO", propertyId: prop.id, details: { fields: Object.keys(patch), eligibility: r?.eligibility } });
  if (r?.eligibility === "ELIGIBLE") await enqueue(Q.processProperty, { propertyId: prop.id }, prop.id).catch(() => null);
  revalidatePath(`/apartments/${prop.id}`);
  return { ok: true };
}

const ImportSchema = z.object({ url: z.string().url().max(1000).or(z.literal("")), text: z.string().min(20).max(30000), useAi: z.string().optional() });

export async function importListingAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const p = ImportSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { ok: false, code: "invalid" };
  const listing = listingFromText("manual", { text: p.data.text, url: p.data.url || null, sourceListingId: p.data.url || null });
  if (p.data.useAi && aiConfigured()) {
    try {
      const facts = await extractListingFacts(user.id, p.data.text);
      // Deterministic values win; AI only fills gaps, and only with verbatim evidence.
      for (const [k, v] of Object.entries(facts)) {
        const key = k as keyof typeof listing;
        const cur = listing[key];
        if (cur == null || cur === "UNKNOWN") (listing as unknown as Record<string, unknown>)[key] = v;
      }
    } catch (e) {
      if (!(e instanceof AiUnavailableError)) throw e;
    }
  }
  if (listing.postalCode) listing.city = "Berlin";
  const stats = await ingestListings(user.id, "manual", [listing]);
  const id = stats.touchedIds[0];
  await recordActivity({ userId: user.id, action: "listing.imported", result: "SUCCESS", propertyId: id ?? null });
  for (const e of stats.newEligibleIds) await enqueue(Q.processProperty, { propertyId: e }, e).catch(() => null);
  revalidatePath("/", "layout");
  return { ok: true, data: { propertyId: id, href: id ? `/apartments/${id}` : null } };
}

export async function translateDescriptionAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const id = z.string().uuid().parse(form.get("propertyId"));
  const p = await owned(user.id, id);
  if (!p?.descriptionDe) return { ok: false, code: "nothing" };
  try {
    const fa = await translate(user.id, p.descriptionDe, "de", "fa");
    await getDb().update(schema.properties).set({ descriptionFa: fa }).where(eq(schema.properties.id, id));
    revalidatePath(`/apartments/${id}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof AiUnavailableError) return { ok: false, code: "ai", message: e.message };
    throw e;
  }
}
