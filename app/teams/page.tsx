import { TeamsBrowser } from "@/components/TeamsBrowser";
import { getAllMatches } from "@/lib/football";
import { followableTeams } from "@/lib/follows";

export const revalidate = 300;

export const metadata = {
  title: "Follow teams",
  description: "Follow your favourite clubs and national teams to personalise your BarcaPulse feed.",
};

export default async function TeamsPage() {
  const teams = followableTeams(await getAllMatches());
  return (
    <>
      <div className="px-4 mt-4 mb-3">
        <h1 className="text-xl font-extrabold text-white">⭐ Follow teams</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Follow clubs and national sides — their matches show up under{" "}
          <span className="text-white">Your Teams</span> on the home page.
        </p>
      </div>
      <TeamsBrowser teams={teams} />
    </>
  );
}
