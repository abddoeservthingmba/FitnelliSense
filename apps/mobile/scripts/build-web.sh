#!/usr/bin/env bash
#
# Builds the web app and the host configuration that goes with it.
#
#   pnpm build:web                          # uses the production API
#   API=http://localhost:3000 pnpm build:web
#
# On Netlify, set EXPO_PUBLIC_API_URL in the site's environment instead.
#
# Output is `web-build/`, ready to drop on any static host that reads
# `_headers` and `_redirects` — Cloudflare Pages and Netlify both do.
#
# WHY THE HEADERS ARE GENERATED RATHER THAN WRITTEN BY HAND
#
# On web there is no Keystore, so the session lives in localStorage and is
# therefore readable by any script that gets injected. A strict
# Content-Security-Policy is the mitigation, and a strict CSP means no
# `script-src 'unsafe-inline'`.
#
# Expo's export puts one inline bootstrap script in every page. Allowing it by
# HASH keeps the policy strict — but the hash is Expo's to change, and a CSP
# that silently stops matching produces a blank white app. So the hash is
# computed from the export that was just produced, every time. If Expo changes
# that line, the policy follows it on the next build instead of breaking.
set -euo pipefail

cd "$(dirname "$0")/.."

# EXPO_PUBLIC_API_URL first, because that is the name Netlify's UI will be
# given and the name the client already reads at runtime. API is the shorthand
# for a local build.
API="${EXPO_PUBLIC_API_URL:-${API:-https://fitnellisense.onrender.com}}"
OUT="web-build"

echo "==> Building for web against $API"
rm -rf "$OUT"
EXPO_PUBLIC_API_URL="$API" npx expo export --platform web --output-dir "$OUT"

echo "==> Generating _headers and _redirects"
API_ORIGIN="$API" node scripts/write-web-headers.mjs "$OUT"

echo
echo "==> Done. $OUT/ contains:"
du -sh "$OUT"
find "$OUT" -name '*.html' | wc -l | xargs printf '    %s HTML routes\n'
echo
cat <<'NEXT'
Deploy it with whichever of these you prefer — all free, all read _headers
and _redirects:

  Cloudflare Pages   npx wrangler pages deploy web-build --project-name ascension
  Netlify            npx netlify deploy --dir web-build --prod

Then add the site's origin to CORS_ORIGINS on the API (comma-separated) and
redeploy it, or the browser will refuse every request. The API rejects a
wildcard outside development, so this cannot be skipped.

Finally, open it IN A BROWSER and sign in. The CORS test suite cannot catch a
real preflight failure, because native Android sends no Origin header at all.
NEXT
