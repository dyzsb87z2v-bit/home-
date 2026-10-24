"use server";

import { and, count, eq, gte } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clientIp, createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { getDb, schema } from "@/lib/database/client";
import { audit } from "@/lib/logging";
import type { ActionResult } from "./types";

let dummy: Promise<string> | null = null;
const dummyHash = () => (dummy ??= hashPassword("timing-equalizer-not-a-password"));

const LoginSchema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200), locale: z.enum(["fa", "de"]) });

export async function loginAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const parsed = LoginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, code: "invalid" };
  const db = getDb();
  const ip = await clientIp();

  // Brute-force protection: max 10 failed attempts per IP / 15 minutes
  const since = new Date(Date.now() - 15 * 60_000);
  const [{ n }] = (await db
    .select({ n: count() })
    .from(schema.auditLogs)
    .where(and(eq(schema.auditLogs.action, "auth.login_failed"), eq(schema.auditLogs.ip, ip ?? "unknown"), gte(schema.auditLogs.at, since)))) as [{ n: number }];
  if (n >= 10) return { ok: false, code: "rateLimited" };

  const email = parsed.data.email.trim().toLowerCase();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  // Constant-ish time: always run a bcrypt comparison
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? (await dummyHash()));
  if (!user || !ok) {
    await audit({ userId: user?.id ?? null, actor: "anonymous", action: "auth.login_failed", ip: ip ?? "unknown" });
    return { ok: false, code: "invalid" };
  }
  await createSession(user.id);
  await audit({ userId: user.id, actor: "user", action: "auth.login", ip });
  redirect(`/${user.locale}`);
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
