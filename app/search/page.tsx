import { SearchClient } from "@/components/SearchClient";

export const metadata = {
  title: "Search",
  description: "Search teams, matches, news and blog posts across BarcaPulse.",
};

export default function SearchPage() {
  return (
    <>
      <h1 className="px-4 mt-4 text-xl font-extrabold text-white">Search</h1>
      <SearchClient />
    </>
  );
}
