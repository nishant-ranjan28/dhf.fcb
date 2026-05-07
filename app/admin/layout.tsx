import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Admin",
};

// Bare layout for /admin — the authed-area shell (with nav, logout) lives in
// app/admin/blog/layout.tsx so the login page doesn't show post-auth nav.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen">{children}</div>;
}
