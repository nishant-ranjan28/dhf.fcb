import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_COOKIE } from "@/lib/blog/cookie";

// Edge runtime can't import node:crypto, so we do a lightweight cookie-presence
// check here and re-validate the token in the route handlers (Node runtime,
// which CAN use timingSafeEqual). Cheap defense; the route handler is the
// real authority.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow the login page itself + the API endpoints used by it.
  if (
    pathname.startsWith("/admin/login") ||
    pathname.startsWith("/api/admin/login") ||
    pathname.startsWith("/api/admin/logout")
  ) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin")) {
    const cookie = req.cookies.get(ADMIN_COOKIE);
    if (!cookie?.value) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("from", pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
