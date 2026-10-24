import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildAuthUrl, gmailConfigured } from "@/integrations/email/gmail";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!gmailConfigured()) return NextResponse.json({ error: "gmail_not_configured" }, { status: 503 });
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(buildAuthUrl(state));
  // CSRF protection: state must round-trip through this httpOnly cookie
  res.cookies.set("brh_oauth_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/email/google", maxAge: 600 });
  return res;
}
