import { listNews } from "@/lib/news";
import { isTelegramConfigured } from "@/lib/telegram";
import { SendToTelegramButton } from "@/components/SendToTelegramButton";

export const dynamic = "force-dynamic";

function timeAgo(iso: string): string {
  const diff = Date.now() - +new Date(iso);
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default async function AdminNewsPage() {
  const posts = await listNews(undefined, 60);
  const tgConfigured = isTelegramConfigured();

  return (
    <div className="px-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-bold text-white">News feed</h1>
        <p className="text-[11px] text-ink-muted">
          {posts.length} item{posts.length === 1 ? "" : "s"} · cached 10 min
        </p>
      </div>

      {!tgConfigured && (
        <p className="text-[11px] text-ink-muted mb-3">
          Telegram not configured. Set <code>TELEGRAM_BOT_TOKEN</code> and{" "}
          <code>TELEGRAM_CHANNEL_ID</code> in Vercel env to enable Send-to-Telegram on news items.
        </p>
      )}

      <ul className="divide-y divide-ink-line bg-ink-soft border border-ink-line rounded-xl">
        {posts.map((p) => (
          <li key={p.id} className="px-3 py-2.5 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <a
                href={p.link ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm text-white truncate font-medium hover:text-barca-gold"
              >
                {p.title}
              </a>
              <div className="text-[11px] text-ink-muted truncate flex items-center gap-2">
                <span className="uppercase tracking-wide">{p.category}</span>
                {p.lang && p.lang !== "en" && (
                  <span className="px-1 rounded bg-ink/60 ring-1 ring-ink-line">{p.lang.toUpperCase()}</span>
                )}
                <span>·</span>
                <span>{timeAgo(p.createdAt)}</span>
              </div>
            </div>
            {tgConfigured && p.link && (
              <SendToTelegramButton
                payload={{
                  kind: "news",
                  title: p.title,
                  link: p.link,
                  source: sourceLabelFromId(p.id),
                }}
                label="Send to TG"
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// RSS post ids look like "bbc-sport-barcelona-3-headline-words". The source
// is everything before the first numeric segment. Pretty-print a few common
// prefixes; fall back to the raw slug.
function sourceLabelFromId(id: string): string {
  const match = id.match(/^([a-z-]+?)-\d/);
  const slug = match?.[1] ?? id;
  const map: Record<string, string> = {
    "bbc-sport-barcelona": "BBC Sport",
    "bbc-sport-football": "BBC Sport",
    "the-guardian-barcelona": "The Guardian",
    "espn-fc": "ESPN FC",
    "marca-barca": "Marca",
    "mundo-deportivo-barca": "Mundo Deportivo",
    "r-barca": "r/Barca",
  };
  return map[slug] ?? slug.replace(/-/g, " ");
}
