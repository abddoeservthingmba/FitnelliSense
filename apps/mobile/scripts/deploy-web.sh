#!/usr/bin/env bash
#
# Builds the web app HERE and uploads the finished directory to Netlify.
#
#   pnpm deploy:web            # deploy to production
#   pnpm deploy:web --draft    # a preview URL, does not touch the live site
#
# WHY THIS EXISTS: Netlify bills BUILD MINUTES, and the credits on this account
# are nearly gone. Auto-deploy on push has been switched off for that reason.
#
# `netlify deploy --dir` uploads an already-built directory, so Netlify runs no
# build at all and no minutes are consumed — only the upload, which is free.
# The build happens on this machine, where it costs nothing. That is the whole
# point of the script, and it is why the build must NOT be left to netlify.toml.
#
# The intended cadence is roughly twice a week rather than per push. The APK is
# the primary channel; web follows.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE="$(dirname "$HERE")"
OUT="$MOBILE/web-build"

# Baked into the bundle. A web build pointing at localhost reaches the
# visitor's own machine and fails in a way that looks like the server is down.
export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-https://fitnellisense.onrender.com}"

DRAFT=""
for arg in "$@"; do
  [[ "$arg" == "--draft" ]] && DRAFT="1"
done

cd "$MOBILE"

echo "==> building web against $EXPO_PUBLIC_API_URL"
rm -rf "$OUT"
npx expo export --platform web --output-dir "$OUT"

# The security headers Netlify would otherwise have to be told about at build
# time. Written into the output directory so they travel with the upload.
node scripts/write-web-headers.mjs "$OUT"
node scripts/check-web-headers.mjs "$OUT"

echo
if [[ -n "$DRAFT" ]]; then
  echo "==> netlify deploy (draft)"
  npx netlify-cli deploy --dir "$OUT"
else
  echo "==> netlify deploy --prod"
  npx netlify-cli deploy --dir "$OUT" --prod
fi

echo
echo "No Netlify build minutes were used: the bundle was built here and only"
echo "the finished files were uploaded."
