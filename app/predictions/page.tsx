import { SectionTitle } from "@/components/SectionTitle";
import { PredictionLeaderboard } from "@/components/PredictionLeaderboard";
import { POINTS } from "@/lib/predictions/scoring";

export const metadata = {
  title: "Predictions leaderboard",
  description: "Predict World Cup and Barça scorelines and climb the BarcaPulse leaderboard.",
};

export default function PredictionsPage() {
  return (
    <>
      <div className="px-4 mt-4">
        <h1 className="text-xl font-extrabold text-white">🔮 Predictions</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Call the score on any upcoming match. Earn <b className="text-barca-gold">{POINTS.exact} pts</b>{" "}
          for an exact scoreline, <b className="text-white">{POINTS.result} pts</b> for the right result.
          Predictions lock at kickoff.
        </p>
      </div>

      <SectionTitle title="Leaderboard" accent="purple" />
      <PredictionLeaderboard />

      <p className="px-4 mt-4 mb-2 text-[11px] text-ink-muted">
        Open a match from the <a href="/fifa" className="text-fifa-purple hover:text-white">FIFA</a> or{" "}
        <a href="/barca" className="text-fifa-purple hover:text-white">Barça</a> page to make a prediction.
      </p>
    </>
  );
}
