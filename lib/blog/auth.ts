import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { ADMIN_COOKIE } from "./cookie";

// Re-export the Edge-safe helpers so existing imports of "@/lib/blog/auth"
// keep working. The Node-only verification lives below.
export {
  ADMIN_COOKIE,
  buildAdminCookie,
  buildLogoutCookie,
} from "./cookie";

/** Constant-time check that a candidate token matches env.adminToken.
 *  Returns false when no admin token is configured (locks down the app). */
export function isValidAdminToken(token: string | undefined): boolean {
  const real = env.adminToken;
  if (!real || !token) return false;
  if (token.length !== real.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(real));
  } catch {
    return false;
  }
}

/** Pull the admin token from the Authorization header (Bearer scheme). */
export function tokenFromAuthHeader(req: Request): string | undefined {
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return m?.[1];
}

/** Pull the admin token from the cookie set by /api/admin/login. */
export function tokenFromCookie(req: Request): string | undefined {
  const cookie = req.headers.get("cookie") ?? "";
  for (const part of cookie.split(/;\s*/)) {
    const [name, ...rest] = part.split("=");
    if (name === ADMIN_COOKIE) return rest.join("=");
  }
  return undefined;
}

/** True if the request carries valid admin auth via either header or cookie. */
export function isAdminAuthorized(req: Request): boolean {
  return (
    isValidAdminToken(tokenFromAuthHeader(req)) ||
    isValidAdminToken(tokenFromCookie(req))
  );
}
