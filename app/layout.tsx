import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { env } from "@/lib/env";

const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

export const metadata: Metadata = {
  title: {
    default: "BarcaPulse — Live football, Barca & FIFA",
    template: "%s · BarcaPulse",
  },
  description:
    "Mobile-first live scores, lineups, news for FC Barcelona and the FIFA World Cup.",
  applicationName: "BarcaPulse",
  openGraph: {
    type: "website",
    siteName: "BarcaPulse",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B0B0F",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const showTelegramWarning =
    process.env.NODE_ENV !== "production" && env.telegramUrl === "https://t.me/";

  return (
    <html lang="en">
      <body className="bg-ink text-white antialiased min-h-screen">
        {showTelegramWarning && (
          <div className="bg-amber-500/20 text-amber-300 text-[11px] py-1 px-3 text-center">
            Set <code>NEXT_PUBLIC_TELEGRAM_URL</code> in <code>.env.local</code> to wire the CTA.
          </div>
        )}
        <Header />
        <main className="mx-auto max-w-screen pb-20">{children}</main>
        <BottomNav />
        <Analytics />
        {ADSENSE_CLIENT && (
          <Script
            id="adsense"
            async
            strategy="afterInteractive"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
            crossOrigin="anonymous"
          />
        )}
      </body>
    </html>
  );
}
