type ProviderName = "mock" | "football-data" | "api-football";

export interface AppEnv {
  provider: ProviderName;
  footballDataKey?: string;
  apiFootballKey?: string;
  enrichmentEnabled: boolean;
  adminToken?: string;
  telegramUrl: string;
  scoresTtlSeconds: number;
  listTtlSeconds: number;
  newsTtlSeconds: number;
}

let cached: AppEnv | null = null;

export const env: AppEnv = new Proxy({} as AppEnv, {
  get(_t, prop: keyof AppEnv) {
    if (!cached) cached = build();
    return cached[prop];
  },
});

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
    telegramUrl: process.env.NEXT_PUBLIC_TELEGRAM_URL ?? "https://t.me/",
    scoresTtlSeconds: Number(process.env.SCORES_TTL_SECONDS ?? 30),
    listTtlSeconds: Number(process.env.LIST_TTL_SECONDS ?? 60),
    newsTtlSeconds: Number(process.env.NEWS_TTL_SECONDS ?? 600),
  };
}

export function resetEnvCache(): void {
  cached = null;
}
