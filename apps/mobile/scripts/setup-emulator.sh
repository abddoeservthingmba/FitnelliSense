#!/usr/bin/env bash
#
# Installs an Android emulator and creates a device to run ARISE on this PC.
#
#   ./scripts/setup-emulator.sh          # install + create the AVD
#   ./scripts/setup-emulator.sh --start  # just boot the one already created
#
# WHY AN EMULATOR AND NOT JUST THE WEB BUILD. `pnpm dev:mobile` then 'w' opens
# the app in a browser in seconds and is the right tool for most work. It
# cannot test the things that are actually platform behaviour: the camera and
# barcode scanning, notifications and the rest timer, haptics, the navigation
# sound, and how the tab bar sits against the system bars. Those need Android.
#
# WHAT THIS COSTS. About 1.6 GB of download and roughly 8 GB on disk once the
# device has booted. There is plenty of room on I: (910 GB free at time of
# writing).
#
# HARDWARE ACCELERATION is the difference between usable and unusable. On an
# Intel machine that means HAXM or WHPX; on AMD, or on any recent Windows with
# Hyper-V, it means WHPX. Enable "Windows Hypervisor Platform" and "Virtual
# Machine Platform" in Windows Features and reboot. Without it the emulator
# still runs and is slow enough that you will not use it twice.
set -euo pipefail

export JAVA_HOME="${JAVA_HOME:-I:/android-toolchain/jdk-17.0.20.1+1}"
export ANDROID_HOME="${ANDROID_HOME:-I:/android-toolchain/sdk}"

SDKMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager.bat"
AVDMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager.bat"
EMULATOR="$ANDROID_HOME/emulator/emulator.exe"

AVD_NAME="arise-pixel"
# API 35 matches what the release APK targets, so what you see here is what
# ships. google_apis rather than google_apis_playstore: no Play Store is needed
# to sideload, and the Play image forbids running as root, which makes
# inspecting app storage harder than it needs to be.
IMAGE="system-images;android-35;google_apis;x86_64"

if [ "${1:-}" = "--start" ]; then
  echo "Booting $AVD_NAME…"
  # -gpu host uses the real GPU; -no-boot-anim shaves a few seconds.
  exec "$EMULATOR" -avd "$AVD_NAME" -gpu host -no-boot-anim
fi

echo "==> Accepting licences (idempotent)"
yes | "$SDKMANAGER" --licenses >/dev/null 2>&1 || true

echo "==> Installing emulator, platform tools and the API 35 image"
"$SDKMANAGER" --install "emulator" "platform-tools" "platforms;android-35" "$IMAGE"

if [ ! -f "$EMULATOR" ]; then
  echo "ERROR: emulator did not install at $EMULATOR" >&2
  exit 1
fi

# Recreating an existing AVD wipes whatever is installed on it, so ask first.
if "$AVDMANAGER" list avd 2>/dev/null | grep -q "Name: $AVD_NAME"; then
  echo "==> $AVD_NAME already exists — leaving it alone."
else
  echo "==> Creating the device"
  # pixel_7 is a sensible modern shape: 1080x2400, which is what most people
  # actually hold, and tall enough to show the six-tab bar honestly.
  echo "no" | "$AVDMANAGER" create avd \
    --name "$AVD_NAME" \
    --package "$IMAGE" \
    --device "pixel_7" \
    --force
fi

cat <<'NEXT'

Done. Two ways to run the app on it:

  1. Boot the device, then let Expo install a dev build:
       ./scripts/setup-emulator.sh --start
       pnpm dev:mobile        # then press 'a'

  2. Or install the release APK you already built:
       ./scripts/setup-emulator.sh --start
       "$ANDROID_HOME"/platform-tools/adb install -r ../../build-output/ARISE-0.7.0.apk

Option 2 tests exactly the binary your friends have. Option 1 gives you fast
reload while working.

If the emulator window opens black and stays black, hardware acceleration is
missing — see the note at the top of this file.
NEXT
