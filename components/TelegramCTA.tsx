import { env } from "@/lib/env";

const TELEGRAM_URL = env.telegramUrl;

export function TelegramCTA({ variant = "strip" }: { variant?: "strip" | "sticky" }) {
  if (variant === "sticky") {
    return (
      <a
        href={TELEGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-14 inset-x-0 z-30 mx-auto max-w-screen px-4"
      >
        <div className="bg-gradient-to-r from-[#229ED9] to-[#0088cc] text-white rounded-t-xl px-4 py-2.5 shadow-lg flex items-center justify-between text-sm font-semibold">
          <span>⚡ Fastest goal updates on Telegram</span>
          <span className="opacity-90">Join →</span>
        </div>
      </a>
    );
  }
  return (
    <a
      href={TELEGRAM_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="block mx-4 my-3"
    >
      <div className="bg-gradient-to-r from-[#229ED9] to-[#0088cc] text-white rounded-xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden>
            ⚡
          </span>
          <span className="text-sm font-semibold leading-tight">
            Get fastest goal updates → Join Telegram
          </span>
        </div>
        <span className="text-sm font-bold">Join</span>
      </div>
    </a>
  );
}
