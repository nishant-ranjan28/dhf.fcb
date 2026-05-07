// Edge-safe helpers shared by middleware (Edge runtime) and route handlers
// (Node runtime). No `node:crypto` here — keep this file free of Node-only
// imports so middleware can pull from it.

export const ADMIN_COOKIE = "barca_admin";

export function buildAdminCookie(token: string): string {
  const parts = [
    `${ADMIN_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${30 * 24 * 60 * 60}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function buildLogoutCookie(): string {
  const parts = [
    `${ADMIN_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}
