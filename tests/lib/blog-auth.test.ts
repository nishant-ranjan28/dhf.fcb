import { describe, it, expect, beforeEach } from "vitest";
import { resetEnvCache } from "@/lib/env";
import {
  ADMIN_COOKIE,
  buildAdminCookie,
  buildLogoutCookie,
  isAdminAuthorized,
  isValidAdminToken,
  tokenFromAuthHeader,
  tokenFromCookie,
} from "@/lib/blog/auth";

const TOKEN = "a".repeat(64);

function req(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/", { headers });
}

describe("blog/auth", () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = TOKEN;
    resetEnvCache();
  });

  it("isValidAdminToken returns false when env unset", () => {
    delete process.env.ADMIN_TOKEN;
    resetEnvCache();
    expect(isValidAdminToken(TOKEN)).toBe(false);
  });

  it("isValidAdminToken accepts the configured token", () => {
    expect(isValidAdminToken(TOKEN)).toBe(true);
  });

  it("isValidAdminToken rejects wrong tokens (constant-time path)", () => {
    expect(isValidAdminToken("b".repeat(64))).toBe(false);
    expect(isValidAdminToken(TOKEN.slice(0, -1) + "b")).toBe(false);
  });

  it("isValidAdminToken rejects length mismatches without throwing", () => {
    expect(isValidAdminToken("short")).toBe(false);
    expect(isValidAdminToken("")).toBe(false);
    expect(isValidAdminToken(undefined)).toBe(false);
  });

  it("tokenFromAuthHeader extracts a Bearer token", () => {
    const r = req({ authorization: `Bearer ${TOKEN}` });
    expect(tokenFromAuthHeader(r)).toBe(TOKEN);
  });

  it("tokenFromAuthHeader is case-insensitive on the scheme", () => {
    const r = req({ authorization: `bearer ${TOKEN}` });
    expect(tokenFromAuthHeader(r)).toBe(TOKEN);
  });

  it("tokenFromCookie parses the admin cookie", () => {
    const r = req({ cookie: `${ADMIN_COOKIE}=${TOKEN}; path=/` });
    expect(tokenFromCookie(r)).toBe(TOKEN);
  });

  it("tokenFromCookie handles multiple cookies", () => {
    const r = req({ cookie: `other=x; ${ADMIN_COOKIE}=${TOKEN}; another=y` });
    expect(tokenFromCookie(r)).toBe(TOKEN);
  });

  it("isAdminAuthorized accepts header OR cookie", () => {
    expect(isAdminAuthorized(req({ authorization: `Bearer ${TOKEN}` }))).toBe(true);
    expect(isAdminAuthorized(req({ cookie: `${ADMIN_COOKIE}=${TOKEN}` }))).toBe(true);
    expect(isAdminAuthorized(req())).toBe(false);
    expect(isAdminAuthorized(req({ authorization: `Bearer wrong` }))).toBe(false);
  });

  it("buildAdminCookie sets HttpOnly + SameSite + Max-Age", () => {
    const c = buildAdminCookie(TOKEN);
    expect(c).toContain(`${ADMIN_COOKIE}=${TOKEN}`);
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Lax");
    expect(c).toMatch(/Max-Age=\d+/);
  });

  it("buildLogoutCookie expires the cookie", () => {
    expect(buildLogoutCookie()).toContain("Max-Age=0");
  });
});
