export interface PollOption {
  id: string;
  label: string;
  /** Optional flag emoji shown next to the label. */
  flag?: string;
}

export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
}

/**
 * Active polls, keyed by id. Edit here to change the question or options;
 * counts live in Redis (see lib/poll/store.ts) and are never reset by a deploy.
 */
export const POLLS: Record<string, Poll> = {
  "wc-2026-winner": {
    id: "wc-2026-winner",
    question: "Who lifts the 2026 World Cup?",
    options: [
      { id: "argentina", label: "Argentina", flag: "🇦🇷" },
      { id: "france", label: "France", flag: "🇫🇷" },
      { id: "brazil", label: "Brazil", flag: "🇧🇷" },
      { id: "england", label: "England", flag: "🏴" },
      { id: "spain", label: "Spain", flag: "🇪🇸" },
      { id: "other", label: "Someone else", flag: "⚽" },
    ],
  },
};

export function getPoll(id: string): Poll | undefined {
  return POLLS[id];
}
