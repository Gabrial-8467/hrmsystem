import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ACCESS_COOKIE = "hrms_at";

const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasAccessToken = request.cookies.has(ACCESS_COOKIE);

  // Force HTTPS in production for security (no-op on localhost).
  if (
    process.env.NODE_ENV === "production" &&
    request.nextUrl.protocol === "http:"
  ) {
    return NextResponse.redirect(
      new URL(`https://${request.nextUrl.host}${pathname}`, request.url),
    );
  }

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!hasAccessToken && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  if (hasAccessToken && isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  /*
   * Match all paths except static assets, images, and API routes.
   * Note: the real enforcement happens server-side on the backend; this proxy
   * is an optimistic UX guard only.
   */
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};