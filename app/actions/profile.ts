"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/database/client";
import type { ProfileFact } from "@/lib/database/schema";
import { audit } from "@/lib/logging";
import { FACT_KEYS } from "@/features/users/facts";
import type { ActionResult } from "./types";


const ProfileSchema = z.object({
  fullName: z.string().min(2).max(120),
  contactEmail: z.string().email().or(z.literal("")),
  phone: z.string().max(40),
  adults: z.coerce.number().int().min(1).max(10),
  children: z.coerce.number().int().min(0).max(10),
  childAges: z.string().max(40),
  monthlyNetIncomeEur: z.string().max(10),
  incomeVerified: z.string().optional(),
  schufaAvailable: z.enum(["YES", "NO", "UNKNOWN"]),
});

export async function saveProfileAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const p = ProfileSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { ok: false, code: "invalid", message: p.error.issues.map((i) => i.path.join(".")).join(", ") };
  const db = getDb();
  const facts: Record<string, ProfileFact> = {};
  for (const k of FACT_KEYS) {
    const value = String(form.get(`fact.${k}`) ?? "").trim().slice(0, 500);
    facts[k] = { value: value || null, verified: !!value && form.get(`fact.${k}.verified`) === "on" };
  }
  const income = p.data.monthlyNetIncomeEur.trim() ? Number(p.data.monthlyNetIncomeEur.replace(/\D/g, "")) : null;
  await db
    .update(schema.applicantProfiles)
    .set({ fullName: p.data.fullName.trim(), contactEmail: p.data.contactEmail || null, phone: p.data.phone || null, facts, schufaAvailable: p.data.schufaAvailable })
    .where(eq(schema.applicantProfiles.userId, user.id));
  await db
    .update(schema.households)
    .set({
      adults: p.data.adults,
      children: p.data.children,
      childAges: p.data.childAges.split(/[,\s]+/).filter(Boolean).map(Number).filter((n) => n >= 0 && n < 30),
      monthlyNetIncomeEur: income,
      incomeVerified: !!p.data.incomeVerified,
    })
    .where(eq(schema.households.userId, user.id));
  await audit({ userId: user.id, actor: "user", action: "profile.updated" });
  revalidatePath("/profile");
  return { ok: true };
}
