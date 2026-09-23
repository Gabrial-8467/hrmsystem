import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware: enforces HTTPS in production (no-op on localhost).
 *
 * NOTE: auth is token-based (Authorization bearer header + localStorage), so
 * the proxy cannot read the session state. Route protection happens in the
 * client-side SessionProvider / protected layouts, and is enforced server-side
 * on the backend API.
 */
export function proxy(request: NextRequest) {
  // Force HTTPS in production for security (no-op on localhost).
  if (
    process.env.NODE_ENV === "production" &&
    request.nextUrl.protocol === "http:"
  ) {
    return NextResponse.redirect(
      new URL(`https://${request.nextUrl.host}${request.nextUrl.pathname}`, request.url),
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};