# Releases

**The APKs are not committed** — ~69 MB each, and git history keeps every
version forever. They live on
[GitHub Releases](https://github.com/abddoeservthingmba/FitnelliSense/releases),
which is the right home for a binary: a permanent download link per version,
release notes beside it, and no weight added to a clone.

This file is the version log. It is tracked precisely so a **changed signing
certificate is visible in a pull request** rather than discovered by a user
whose update refuses to install.

## Version log

| Version   | Code | Package                     | Date       | What changed                                                                                                   |
| --------- | ---- | --------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| **0.4.0** | 7    | com.arise.fitness           | 2026-09-02 | **Renamed ARISE.** New icon and palette, launch screen, cardio tracking. New package: install is NOT an update |
| 0.3.1     | 5    | com.fitnessintellisense.app | 2026-09-01 | Security: allowBackup off, password rules, drizzle CVE, CI fixed                                               |
| 0.3.0     | 4    | com.fitnessintellisense.app | 2026-09-01 | Movement demos, tier strip, email verification, password reset, nutrition + barcode                            |
| 0.2.0     | 3    | com.fitnessintellisense.app | 2026-09-01 | The Hunter System — levels, ranks, quests, badges, leaderboard                                                 |

**0.4.0 changed the package name.** Android treats it as a different app: the
old _Fitness Intellisense_ must be uninstalled, and it will not update in
place. Both can sit on a phone at once, which is confusing rather than useful.
Agreed while only one device had it installed; after a Play Store listing the
package is permanent.

## Current build

|                           |                                                                    |
| ------------------------- | ------------------------------------------------------------------ |
| File                      | `ARISE-0.4.0.apk`                                                  |
| Package                   | `com.arise.fitness`                                                |
| versionName / versionCode | 0.4.0 / 7                                                          |
| Size                      | 72,722,405 bytes (69.4 MB)                                         |
| SHA-256                   | `57bcdf8b96e487f700b791765eacf67a2e49219956b797ad414506767f0b9a10` |
| **Signing cert SHA-256**  | `c35574e619810ce487e6e92d2e3cbabced3e85356f32e4d793183335a0fee5de` |
| API                       | `https://fitnellisense.onrender.com`                               |
| ABIs                      | arm64-v8a, armeabi-v7a                                             |
| allowBackup               | `false`                                                            |

## The check that matters before every release

```bash
apksigner verify --print-certs build-output/FitnessIntellisense-*.apk
```

The certificate digest **must** equal the value in the table above. If it
differs, the signing identity has changed and every existing user has to
uninstall before they can update — which, for people trialling the app, means
losing their session and reinstalling for no visible reason.

`versionCode` must also increase on every build. Android refuses to install an
APK whose code is lower than the installed one, and gives a confusing error when
it is equal.

## Publishing a release

```bash
# 1. Build (see docs/runbook.md → Deploy for the full environment)
cd apps/mobile && npx expo prebuild --platform android --no-install
cd android && gradle assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a

# 2. Copy out and record the hash
cp app/build/outputs/apk/release/app-release.apk \
   ../../../build-output/FitnessIntellisense-<version>.apk
sha256sum ../../../build-output/FitnessIntellisense-<version>.apk

# 3. Attach it to a GitHub Release tagged v<version>
```

## ABIs

x86 and x86_64 are deliberately excluded. They exist only for emulators and
nearly doubled the file. Every physical Android phone is arm.

## Installing

Sideloading needs "install unknown apps" enabled for whichever app opens the
file. The build is signed with a self-generated key rather than a Play Store
one, so Play Protect will warn — expected for a sideloaded build, and not a sign
of anything wrong.
