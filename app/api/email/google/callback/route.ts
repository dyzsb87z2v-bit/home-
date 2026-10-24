import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/database/client";
import { audit, recordActivity } from "@/lib/logging";
import { encryptString } from "@/lib/security/crypto";
import { exchangeCode, gmailProfile } from "@/integrations/email/gmail";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const base = process.env.APP_URL ?? req.nextUrl.origin;
  if (!user) return NextResponse.redirect(`${base}/login`);
  const back = (msg: string) => {
    const r = NextResponse.redirect(`${base}/${user.locale}/settings?email=${encodeURIComponent(msg)}`);
    r.cookies.delete({ name: "brh_oauth_state", path: "/api/email/google" });
    return r;
  };
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const expected = req.cookies.get("brh_oauth_state")?.value ?? "";
  if (!state || state.length !== expected.length || !timingSafeEqual(Buffer.from(state), Buffer.from(expected))) return back("state_mismatch");
  const error = req.nextUrl.searchParams.get("error");
  if (error) return back(error.slice(0, 40));
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return back("missing_code");

  try {
    const tokens = await exchangeCode(code);
    const address = (await gmailProfile(tokens.accessToken)).toLowerCase();
    const db = getDb();
    const [acct] = await db
      .insert(schema.emailAccounts)
      .values({ userId: user.id, provider: "GMAIL", emailAddress: address, encryptedRefreshToken: encryptString(tokens.refreshToken), scopes: tokens.scopes, status: "CONNECTED", lastError: null })
      .onConflictDoUpdate({
        target: [schema.emailAccounts.userId, schema.emailAccounts.provider, schema.emailAccounts.emailAddress],
        set: { encryptedRefreshToken: encryptString(tokens.refreshToken), scopes: tokens.scopes, status: "CONNECTED", lastError: null },
      })
      .returning();
    await db.update(schema.sourceConnections).set({ authState: "EMAIL_CONNECTED" }).where(eq(schema.sourceConnections.userId, user.id));
    await audit({ userId: user.id, actor: "user", action: "email.connected", target: acct!.id, details: { address, scopes: tokens.scopes } });
    await recordActivity({ userId: user.id, action: "email.connected", result: "SUCCESS", details: { address } });
    return back("connected");
  } catch (e) {
    await recordActivity({ userId: user.id, action: "email.sync_failed", result: "FAILURE", error: String((e as Error).message) });
    return back("oauth_failed");
  }
}
