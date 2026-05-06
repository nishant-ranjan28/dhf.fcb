#!/usr/bin/env node
// Pre-fetch openfootball/worldcup.json at build time so the app has a fixture
// list even if every API is down. Run by `prebuild`.
import { writeFile, mkdir } from "node:fs/promises";

const SOURCES = [
  {
    url: "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json",
    out: "data/worldcup-2026.json",
  },
];

await mkdir("data", { recursive: true });
for (const s of SOURCES) {
  try {
    const res = await fetch(s.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    await writeFile(s.out, body);
    console.log(`✓ ${s.out} (${body.length} bytes)`);
  } catch (e) {
    console.warn(
      `! could not fetch ${s.url}: ${e.message}. Keeping previous file if any.`,
    );
  }
}
