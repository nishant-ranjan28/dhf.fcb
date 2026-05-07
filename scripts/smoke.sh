#!/usr/bin/env bash
# scripts/smoke.sh — quick HTTP smoke test of every public route.
# Usage:  ./scripts/smoke.sh                     (defaults to localhost:3000)
#         ./scripts/smoke.sh https://barcapulse.com
set -euo pipefail

URL="${1:-http://localhost:3000}"
URL="${URL%/}"

ROUTES=(
  "/"
  "/barca"
  "/fifa"
  "/live"
  "/blog"
  "/about"
  "/privacy"
  "/terms"
  "/api/scores"
  "/api/scores?live=1"
  "/api/news"
  "/api/news?category=barca"
  "/api/news?category=fifa"
  "/api/blog"
  "/robots.txt"
  "/sitemap.xml"
  "/opengraph-image"
)

# Resolve a real match slug to test the dynamic route.
SLUG=$(curl -fsS "${URL}/api/scores" | node -e '
let buf=""; process.stdin.on("data",d=>buf+=d).on("end",()=>{
  try { const j = JSON.parse(buf); console.log(j.matches?.[0]?.slug ?? ""); } catch { console.log(""); }
});')

if [[ -n "$SLUG" ]]; then
  ROUTES+=("/match/${SLUG}" "/api/scores/${SLUG}" "/api/live/stream?slug=${SLUG}")
fi

fail=0
for path in "${ROUTES[@]}"; do
  # SSE endpoint never closes on its own; cap with --max-time 2.
  if [[ "$path" == "/api/live/stream"* ]]; then
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "${URL}${path}" || true)
  else
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "${URL}${path}")
  fi
  printf "%-50s %s\n" "$path" "$code"
  if [[ "$code" != "200" ]]; then fail=1; fi
done

if [[ $fail -ne 0 ]]; then
  echo
  echo "FAIL — at least one route did not return 200"
  exit 1
fi
echo
echo "OK — all routes 200"
