import { highlightsStore } from "@/lib/highlights/store";
import { isTelegramConfigured } from "@/lib/telegram";
import { HighlightsManager } from "@/components/admin/HighlightsManager";

export const dynamic = "force-dynamic";

export default async function AdminHighlightsPage() {
  const highlights = await highlightsStore().list();
  const tgConfigured = isTelegramConfigured();
  return (
    <div className="px-4 mt-4">
      <h1 className="text-lg font-bold text-white mb-1">Highlights</h1>
      <p className="text-[11px] text-ink-muted mb-4">
        Paste a YouTube link (watch, youtu.be, embed or shorts) and a title. These
        appear in the Highlights reel on the FIFA page, newest first.
      </p>
      {!tgConfigured && (
        <p className="text-[11px] text-ink-muted mb-3">
          Telegram not configured. Set <code>TELEGRAM_BOT_TOKEN</code> and{" "}
          <code>TELEGRAM_CHANNEL_ID</code> in Vercel env to enable Send-to-Telegram.
        </p>
      )}
      <HighlightsManager initial={highlights} telegramConfigured={tgConfigured} />
    </div>
  );
}
