import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";

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
  return (
    <html lang="en">
      <body className="bg-ink text-white antialiased min-h-screen">
        <Header />
        <main className="mx-auto max-w-screen pb-20">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
