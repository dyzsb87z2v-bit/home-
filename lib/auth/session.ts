import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "brh_session";
export const SESSION_TTL_DAYS = 30;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (≥32 chars)");
  return new TextEncoder().encode(s);
}

export type SessionClaims = { sid: string; uid: string };

export async function signSession(claims: SessionClaims, expiresAt: Date) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret());
}

/** Signature/expiry check only (safe for Proxy). Server code must also call getCurrentUser(). */
export async function verifySessionToken(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (typeof payload.sid !== "string" || typeof payload.uid !== "string") return null;
    return { sid: payload.sid, uid: payload.uid };
  } catch {
    return null;
  }
}
