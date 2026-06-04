export interface FeaturedPlayer {
  name: string;
  team: string;
  flag: string;
  goals: number;
  assists: number;
}

/**
 * Featured players / top scorers shown on the FIFA page. This is editorial,
 * hand-curated data — update it as the tournament progresses. (We don't have a
 * live top-scorer feed wired in; swap this for one later if a provider is added.)
 */
export const FEATURED_PLAYERS: FeaturedPlayer[] = [
  { name: "Kylian Mbappé", team: "France", flag: "🇫🇷", goals: 4, assists: 1 },
  { name: "Lionel Messi", team: "Argentina", flag: "🇦🇷", goals: 3, assists: 3 },
  { name: "Harry Kane", team: "England", flag: "🏴", goals: 3, assists: 0 },
  { name: "Vinícius Jr.", team: "Brazil", flag: "🇧🇷", goals: 3, assists: 2 },
  { name: "Lamine Yamal", team: "Spain", flag: "🇪🇸", goals: 2, assists: 4 },
  { name: "Erling Haaland", team: "Norway", flag: "🇳🇴", goals: 2, assists: 1 },
];
