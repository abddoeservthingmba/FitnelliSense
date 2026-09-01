#!/usr/bin/env bash
#
# Builds the signed release APK, locally, with no Expo account.
#
#   pnpm apk              # normal build
#   pnpm apk --clean      # wipe android/ first; needed after a native change
#                         # (a new dependency, a package rename, an app.json
#                         # plugin edit). Adds a few minutes.
#
# The toolchain paths below are this machine's. On another machine, set
# JAVA_HOME, ANDROID_HOME and GRADLE to point at a JDK 17, an Android SDK with
# platform 36, and Gradle 9. Everything else is portable.
#
# Signing credentials come from apps/mobile/credentials/keystore.env, which is
# gitignored and NOT backed up. Losing it means never being able to ship an
# update to an installed app. See docs/runbook.md.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE="$(dirname "$HERE")"
ROOT="$(cd "$MOBILE/../.." && pwd)"

export JAVA_HOME="${JAVA_HOME:-I:/android-toolchain/jdk-17.0.20.1+1}"
export ANDROID_HOME="${ANDROID_HOME:-I:/android-toolchain/sdk}"
export PATH="$JAVA_HOME/bin:$PATH"
GRADLE="${GRADLE:-/i/android-toolchain/gradle-9.3.1/bin/gradle.bat}"

# Baked into the bundle at build time. A release build refuses to start if this
# resolves to localhost, because an APK pointing at 127.0.0.1 reaches the phone
# itself and fails in a way that looks like the server is down.
export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-https://fitnellisense.onrender.com}"

CREDENTIALS="$MOBILE/credentials/keystore.env"
if [[ ! -f "$CREDENTIALS" ]]; then
  echo "Missing $CREDENTIALS — the release keystore password lives there." >&2
  echo "Without it Gradle would fall back to the DEBUG key, and Android will" >&2
  echo "refuse to install the result over an existing install." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
. "$CREDENTIALS"
set +a

CLEAN=""
for arg in "$@"; do
  [[ "$arg" == "--clean" ]] && CLEAN="--clean"
done

cd "$MOBILE"

# Read while the working directory IS the mobile package, using a relative
# path. Node on Windows cannot resolve the /i/... form this shell produces, so
# an absolute path here fails after the build has already succeeded — which is
# the most annoying possible moment for it to fail.
VERSION="$(node -p "require('./app.json').expo.version")"

echo "==> prebuild ${CLEAN:-(incremental)}"
# shellcheck disable=SC2086
npx expo prebuild --platform android --no-install $CLEAN

printf 'sdk.dir=%s\n' "$ANDROID_HOME" > android/local.properties

echo "==> gradle assembleRelease"
cd android
# Two ABIs only. x86 exists for emulators and nearly doubles the file; every
# physical Android phone is arm.
"$GRADLE" assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a,armeabi-v7a

APK="$MOBILE/android/app/build/outputs/apk/release/app-release.apk"
DEST="$ROOT/build-output/ARISE-$VERSION.apk"

mkdir -p "$ROOT/build-output"
cp "$APK" "$DEST"

echo
echo "==> $DEST"
# `sha256sum` and `stat`, not Node, for the same path-handling reason.
stat -c 'size    %s bytes' "$DEST"
sha256sum "$DEST" | awk '{print "sha256  " $1}'
echo
echo "Verify the signing certificate before sharing it. It MUST match the"
echo "digest in build-output/README.md, or existing installs cannot update:"
echo "  \"\$ANDROID_HOME\"/build-tools/*/apksigner verify --print-certs \"$DEST\""
