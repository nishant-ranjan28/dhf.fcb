import Link from "next/link";

export default function AuthedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="bg-ink-soft border-b border-ink-line">
        <div className="mx-auto max-w-screen px-4 h-10 flex items-center justify-between text-[12px]">
          <div className="flex items-center gap-3">
            <Link href="/admin/blog" className="font-semibold text-white">
              Admin
            </Link>
            <Link href="/admin/blog" className="text-ink-muted hover:text-white">
              Posts
            </Link>
            <Link href="/admin/blog/new" className="text-ink-muted hover:text-white">
              New post
            </Link>
            <Link href="/admin/news" className="text-ink-muted hover:text-white">
              News
            </Link>
          </div>
          <form action="/api/admin/logout" method="post">
            <button type="submit" className="text-ink-muted hover:text-white">
              Sign out
            </button>
          </form>
        </div>
      </div>
      <main className="mx-auto max-w-screen pb-12">{children}</main>
    </>
  );
}
