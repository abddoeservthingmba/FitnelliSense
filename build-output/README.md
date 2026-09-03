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

| Version   | Code | Package                     | Date       | What changed                                                                                                    |
| --------- | ---- | --------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------- |
| **0.6.0** | 12   | com.arise.fitness           | 2026-09-03 | Cardio logging fixed (server-side); 5 tabs not 7; tab-press flourish and sound. Native change — built `--clean` |
| 0.5.0     | 11   | com.arise.fitness           | 2026-09-02 | **Training insights** — volume, sets and sessions per muscle group against the previous period, with bars       |
| 0.4.3     | 10   | com.arise.fitness           | 2026-09-02 | Barcode scanner: green reticle, decoded digits shown, manual entry, food source displayed                       |
| 0.4.2     | 9    | com.arise.fitness           | 2026-09-02 | Cardio now visible and loggable (minutes/km inputs); 16 machines added                                          |
| 0.4.1     | 8    | com.arise.fitness           | 2026-09-02 | 28 manifest permissions down to 11 — launcher badge and attribution entries removed                             |
| 0.4.0     | 7    | com.arise.fitness           | 2026-09-02 | **Renamed ARISE.** New icon and palette, launch screen, cardio tracking. New package: install is NOT an update  |
| 0.3.1     | 5    | com.fitnessintellisense.app | 2026-09-01 | Security: allowBackup off, password rules, drizzle CVE, CI fixed                                                |
| 0.3.0     | 4    | com.fitnessintellisense.app | 2026-09-01 | Movement demos, tier strip, email verification, password reset, nutrition + barcode                             |
| 0.2.0     | 3    | com.fitnessintellisense.app | 2026-09-01 | The Hunter System — levels, ranks, quests, badges, leaderboard                                                  |

**0.4.0 changed the package name.** Android treats it as a different app: the
old _Fitness Intellisense_ must be uninstalled, and it will not update in
place. Both can sit on a phone at once, which is confusing rather than useful.
Agreed while only one device had it installed; after a Play Store listing the
package is permanent.

## Current build

|                           |                                                                    |
| ------------------------- | ------------------------------------------------------------------ |
| File                      | `ARISE-0.6.0.apk`                                                  |
| Package                   | `com.arise.fitness`                                                |
| versionName / versionCode | 0.6.0 / 12                                                         |
| Size                      | 75,032,560 bytes (71.6 MB)                                         |
| SHA-256                   | `a6d49503ed2bfb3de63716197259fa60f6787b4bcfc1b400dbb0755378cc7a26` |
| **Signing cert SHA-256**  | `c35574e619810ce487e6e92d2e3cbabced3e85356f32e4d793183335a0fee5de` |
| API                       | `https://fitnellisense.onrender.com`                               |
| ABIs                      | arm64-v8a, armeabi-v7a                                             |
| Manifest permissions      | 11 (was 28)                                                        |
| allowBackup               | `false`                                                            |

## The check that matters before every release

```bash
# apksigner is not on PATH and needs a JDK. It ships with the SDK build-tools:
JAVA_HOME="I:/android-toolchain/jdk-17.0.20.1+1" \
  /i/android-toolchain/sdk/build-tools/36.0.0/apksigner.bat \
  verify --print-certs build-output/ARISE-0.5.0.apk
```

Only apksigner can read it. These APKs are signed with **v2/v3 only**, so there
is no `META-INF/*.RSA` entry to unzip — the signature lives in the APK Signing
Block, which is not a zip entry at all. Reaching for `unzip` and `openssl` is a
dead end.

The certificate digest **must** equal the value in the table above. If it
differs, the signing identity has changed and every existing user has to
uninstall before they can update — which, for people trialling the app, means
losing their session and reinstalling for no visible reason.

`versionCode` must also increase on every build. Android refuses to install an
APK whose code is lower than the installed one, and gives a confusing error when
it is equal.

## Publishing a release

```bash
# 1. Bump expo.version and expo.android.versionCode in apps/mobile/app.json
# 2. Build. --clean is required after any NATIVE change: a new dependency, an
#    app.json plugin edit, a package rename. Without it you get a stale build
#    that looks fine and is not.
pnpm apk            # or: pnpm apk --clean
# 3. Verify the certificate against the table above
# 4. Add a row to the version log
# 5. Attach build-output/ARISE-<version>.apk to a GitHub Release tagged v<version>
```

`pnpm apk` handles prebuild, Gradle, signing and the copy into `build-output/`,
and prints the size and SHA-256. It refuses to run without
`apps/mobile/credentials/keystore.env`, because Gradle otherwise falls back to
the **debug** key without saying so, and the resulting APK cannot install over
anything.

## ABIs

x86 and x86_64 are deliberately excluded. They exist only for emulators and
nearly doubled the file. Every physical Android phone is arm.

## Installing

Sideloading needs "install unknown apps" enabled for whichever app opens the
file. The build is signed with a self-generated key rather than a Play Store
one, so Play Protect will warn — expected for a sideloaded build, and not a sign
of anything wrong.
