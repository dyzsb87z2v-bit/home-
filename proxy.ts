import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/lib/localization/routing";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

const intl = createMiddleware(routing);

const PUBLIC_PATHS = [/^\/(fa|de)\/login\/?$/, /^\/login\/?$/];

/**
 * Optimistic gate: unauthenticated visitors are redirected to the login page.
 * Authoritative checks happen server-side (getCurrentUser) on every page and API route.
 */
export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((r) => r.test(pathname));
  if (!isPublic) {
    const ok = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
    if (!ok) {
      const locale = pathname.split("/")[1];
      const l = locale === "de" || locale === "fa" ? locale : routing.defaultLocale;
      return NextResponse.redirect(new URL(`/${l}/login`, req.url));
    }
  }
  return intl(req);
}

export const config = {
  // Skip API routes, Next internals, PWA assets and files with extensions
  matcher: ["/((?!api|_next|sw.js|manifest.webmanifest|icons|.*\\..*).*)"],
};
