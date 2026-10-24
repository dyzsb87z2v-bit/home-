"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/database/client";
import { audit } from "@/lib/logging";
import { NOTIFICATION_CATEGORIES } from "@/features/notifications/service";
import { reevaluateAll } from "@/features/listings/reevaluate";
import type { ActionResult } from "./types";

export async function setLocaleAction(locale: "fa" | "de") {
  const user = await requireUser();
  if (locale !== "fa" && locale !== "de") return;
  await getDb().update(schema.users).set({ locale }).where(eq(schema.users.id, user.id));
}

export async function setThemeAction(form: FormData) {
  const user = await requireUser();
  const theme = z.enum(["system", "light", "dark"]).parse(form.get("theme"));
  await getDb().update(schema.users).set({ theme }).where(eq(schema.users.id, user.id));
  revalidatePath("/", "layout");
}

const SearchSchema = z.object({
  maxWarmRentEur: z.coerce.number().int().min(300).max(5000),
  minRooms: z.coerce.number().min(1).max(10),
  minAreaSqm: z.coerce.number().min(10).max(500),
  requireEntireApartment: z.string().optional(),
  excludeWbs: z.string().optional(),
  longTermOnly: z.string().optional(),
});

export async function saveSearchPreferencesAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const p = SearchSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { ok: false, code: "invalid" };
  await getDb()
    .update(schema.searchPreferences)
    .set({
      maxWarmRentEur: p.data.maxWarmRentEur,
      minRooms: p.data.minRooms,
      minAreaSqm: p.data.minAreaSqm,
      requireEntireApartment: !!p.data.requireEntireApartment,
      excludeWbs: !!p.data.excludeWbs,
      longTermOnly: !!p.data.longTermOnly,
    })
    .where(eq(schema.searchPreferences.userId, user.id));
  await audit({ userId: user.id, actor: "user", action: "preferences.search_updated", details: p.data });
  const n = await reevaluateAll(user.id);
  revalidatePath("/", "layout");
  return { ok: true, data: { reevaluated: n } };
}

export async function saveNotificationPrefsAction(form: FormData) {
  const user = await requireUser();
  const prefs: Record<string, { inApp: boolean; push: boolean; email: boolean }> = {};
  for (const c of NOTIFICATION_CATEGORIES) prefs[c] = { inApp: form.get(`${c}.inApp`) === "on", push: form.get(`${c}.push`) === "on", email: form.get(`${c}.email`) === "on" };
  await getDb().update(schema.searchPreferences).set({ notificationPrefs: prefs }).where(eq(schema.searchPreferences.userId, user.id));
  revalidatePath("/settings");
}

export async function logoutOtherSessionsAction() {
  const user = await requireUser();
  const { cookies } = await import("next/headers");
  const { verifySessionToken, SESSION_COOKIE } = await import("@/lib/auth/session");
  const claims = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  await getDb()
    .update(schema.sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.sessions.userId, user.id), ne(schema.sessions.id, claims?.sid ?? "00000000-0000-0000-0000-000000000000")));
  await audit({ userId: user.id, actor: "user", action: "auth.logout_others" });
  revalidatePath("/settings");
}
