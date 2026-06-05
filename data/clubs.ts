import type { FollowableTeam } from "@/lib/follows";

// Curated club teams so fans can follow clubs even before those clubs have
// fixtures in the loaded data. Names match how the football providers label
// teams (e.g. "FC Barcelona") so a followed club lights up its matches once
// they appear in the feed. competition "barca" is the site's home club; the
// rest are "other".
export const CLUBS: FollowableTeam[] = [
  // LaLiga
  { name: "FC Barcelona", short: "BAR", competition: "barca", label: "LaLiga" },
  { name: "Real Madrid", short: "RMA", competition: "other", label: "LaLiga" },
  { name: "Atlético Madrid", short: "ATM", competition: "other", label: "LaLiga" },
  { name: "Sevilla", short: "SEV", competition: "other", label: "LaLiga" },
  { name: "Real Betis", short: "BET", competition: "other", label: "LaLiga" },
  { name: "Real Sociedad", short: "RSO", competition: "other", label: "LaLiga" },
  { name: "Villarreal", short: "VIL", competition: "other", label: "LaLiga" },
  { name: "Athletic Club", short: "ATH", competition: "other", label: "LaLiga" },
  { name: "Valencia", short: "VAL", competition: "other", label: "LaLiga" },
  // Premier League
  { name: "Manchester City", short: "MCI", competition: "other", label: "Premier League" },
  { name: "Arsenal", short: "ARS", competition: "other", label: "Premier League" },
  { name: "Liverpool", short: "LIV", competition: "other", label: "Premier League" },
  { name: "Manchester United", short: "MUN", competition: "other", label: "Premier League" },
  { name: "Chelsea", short: "CHE", competition: "other", label: "Premier League" },
  { name: "Tottenham Hotspur", short: "TOT", competition: "other", label: "Premier League" },
  { name: "Newcastle United", short: "NEW", competition: "other", label: "Premier League" },
  { name: "Aston Villa", short: "AVL", competition: "other", label: "Premier League" },
  // Serie A
  { name: "Inter Milan", short: "INT", competition: "other", label: "Serie A" },
  { name: "AC Milan", short: "MIL", competition: "other", label: "Serie A" },
  { name: "Juventus", short: "JUV", competition: "other", label: "Serie A" },
  { name: "Napoli", short: "NAP", competition: "other", label: "Serie A" },
  { name: "AS Roma", short: "ROM", competition: "other", label: "Serie A" },
  { name: "Atalanta", short: "ATA", competition: "other", label: "Serie A" },
  // Bundesliga
  { name: "Bayern Munich", short: "BAY", competition: "other", label: "Bundesliga" },
  { name: "Borussia Dortmund", short: "BVB", competition: "other", label: "Bundesliga" },
  { name: "RB Leipzig", short: "RBL", competition: "other", label: "Bundesliga" },
  { name: "Bayer Leverkusen", short: "B04", competition: "other", label: "Bundesliga" },
  // Ligue 1
  { name: "Paris Saint-Germain", short: "PSG", competition: "other", label: "Ligue 1" },
  { name: "Marseille", short: "OM", competition: "other", label: "Ligue 1" },
  { name: "Monaco", short: "ASM", competition: "other", label: "Ligue 1" },
  // Primeira Liga
  { name: "Benfica", short: "BEN", competition: "other", label: "Primeira Liga" },
  { name: "Porto", short: "POR", competition: "other", label: "Primeira Liga" },
  { name: "Sporting CP", short: "SCP", competition: "other", label: "Primeira Liga" },
  // Eredivisie
  { name: "Ajax", short: "AJA", competition: "other", label: "Eredivisie" },
  { name: "PSV Eindhoven", short: "PSV", competition: "other", label: "Eredivisie" },
  { name: "Feyenoord", short: "FEY", competition: "other", label: "Eredivisie" },
  // Scotland
  { name: "Celtic", short: "CEL", competition: "other", label: "Scottish Premiership" },
  { name: "Rangers", short: "RAN", competition: "other", label: "Scottish Premiership" },
];
