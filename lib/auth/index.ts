import "server-only";
import bcrypt from "bcryptjs";
import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb, schema } from "@/lib/database/client";
import { audit } from "@/lib/logging";
import { SESSION_COOKIE, SESSION_TTL_DAYS, signSession, verifySessionToken } from "./session";

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: string) {
  const db = getDb();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  const ua = (await headers()).get("user-agent");
  const [s] = await db.insert(schema.sessions).values({ userId, expiresAt, userAgent: ua?.slice(0, 300) ?? null }).returning();
  const token = await signSession({ sid: s!.id, uid: userId }, expiresAt);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const claims = await verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (claims) {
    await getDb().update(schema.sessions).set({ revokedAt: new Date() }).where(eq(schema.sessions.id, claims.sid));
    await audit({ userId: claims.uid, actor: "user", action: "auth.logout" });
  }
  jar.delete(SESSION_COOKIE);
}

/** Authoritative session check: signature + server-side session row (revocable). */
export const getCurrentUser = cache(async () => {
  const claims = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  const db = getDb();
  const rows = await db
    .select({ user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, claims.sid), isNull(schema.sessions.revokedAt), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0]?.user ?? null;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
}
