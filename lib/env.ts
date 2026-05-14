type ProviderName = "mock" | "football-data" | "api-football";

export interface AppEnv {
  provider: ProviderName;
  footballDataKey?: string;
  apiFootballKey?: string;
  enrichmentEnabled: boolean;
  adminToken?: string;
  telegramUrl: string;
  siteUrl: string;
  scoresTtlSeconds: number;
  listTtlSeconds: number;
  newsTtlSeconds: number;
  cronToken?: string;
  autopostEnabled: boolean;
}

let cached: AppEnv | null = null;

export const env: AppEnv = new Proxy({} as AppEnv, {
  get(_t, prop: keyof AppEnv) {
    if (!cached) cached = build();
    return cached[prop];
  },
});

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function resolveSiteUrl(): string {
  const v = process.env.SITE_URL?.trim();
  if (v) return v.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") {
    // Warn loudly but don't crash the build — example.com in a production
    // sitemap is a self-correcting embarrassment, not an outage.
    console.warn(
      "[env] SITE_URL not set in production — sitemap and OG metadata will point at example.com.",
    );
  }
  return "https://example.com";
}

function build(): AppEnv {
  const fd = process.env.FOOTBALL_DATA_API_KEY?.trim() || undefined;
  const af = process.env.API_FOOTBALL_KEY?.trim() || undefined;
  const provider: ProviderName = fd ? "football-data" : "mock";
  return {
    provider,
    footballDataKey: fd,
    apiFootballKey: af,
    enrichmentEnabled: Boolean(af),
    adminToken: process.env.ADMIN_TOKEN?.trim() || undefined,
    telegramUrl: process.env.NEXT_PUBLIC_TELEGRAM_URL?.trim() || "https://t.me/",
    siteUrl: resolveSiteUrl(),
    scoresTtlSeconds: num(process.env.SCORES_TTL_SECONDS, 30),
    listTtlSeconds: num(process.env.LIST_TTL_SECONDS, 60),
    newsTtlSeconds: num(process.env.NEWS_TTL_SECONDS, 600),
    cronToken: process.env.CRON_TOKEN?.trim() || undefined,
    autopostEnabled: process.env.AUTOPOST_ENABLED?.trim() === "true",
  };
}

export function resetEnvCache(): void {
  cached = null;
}
