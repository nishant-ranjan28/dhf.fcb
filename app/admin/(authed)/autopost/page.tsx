import { autopostState } from "@/lib/autopost/state";

export const dynamic = "force-dynamic";

export default async function AutopostDashboard() {
  const days = await autopostState().recentStats(7);
  const total = days.reduce((acc, d) => ({
    published: acc.published + d.published,
    generated: acc.generated + d.generated,
    errors: acc.errors + d.errors,
    by_gemini: acc.by_gemini + d.by_gemini,
    by_groq: acc.by_groq + d.by_groq,
  }), { published: 0, generated: 0, errors: 0, by_gemini: 0, by_groq: 0 });

  return (
    <div className="px-3 py-4 text-white">
      <h1 className="text-xl font-bold mb-3">Auto-post stats — last 7 days</h1>

      <section className="grid grid-cols-2 gap-2 mb-6">
        <Tile label="Published" value={total.published} />
        <Tile label="Generated" value={total.generated} />
        <Tile label="Gemini" value={total.by_gemini} />
        <Tile label="Groq" value={total.by_groq} />
        <Tile label="Errors" value={total.errors} />
      </section>

      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted mb-2">
        Per day
      </h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-ink-muted">
            <th className="py-1">Date</th>
            <th>Pub</th>
            <th>Gen</th>
            <th>Gemini</th>
            <th>Groq</th>
            <th>Err</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date} className="border-t border-ink-line">
              <td className="py-1">{d.date}</td>
              <td>{d.published}</td>
              <td>{d.generated}</td>
              <td>{d.by_gemini}</td>
              <td>{d.by_groq}</td>
              <td>{d.errors}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted mt-6 mb-2">
        Skip reasons (today)
      </h2>
      <ul className="text-sm space-y-1">
        {Object.entries(days[days.length - 1]?.skipped_by_reason ?? {}).map(
          ([reason, count]) => (
            <li key={reason} className="text-ink-muted">
              <span className="text-white">{count}</span> × {reason}
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-ink-soft border border-ink-line rounded-lg p-3">
      <div className="text-[11px] uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
