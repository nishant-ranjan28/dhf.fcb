import { redirect } from "next/navigation";

// Bare /admin → middleware redirects unauthenticated users to /admin/login,
// authenticated users land here and get pushed into the blog admin.
export default function AdminIndex() {
  redirect("/admin/blog");
}
