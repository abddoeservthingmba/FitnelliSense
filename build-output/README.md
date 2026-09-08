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

| Version   | Code | Package                     | Date       | What changed                                                                                                       |
| --------- | ---- | --------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| **1.9.2** | 29   | com.ascension.fitness       | 2026-09-08 | **Nothing user-visible on Android.** Version bumped so the binary is installable at all — see the note below       |
| 1.5.0     | 21   | com.ascension.fitness       | 2026-09-05 | Google sign-in; in-app microphone for voice logging (adds RECORD_AUDIO); camera viewfinder no longer crops, records 1080p with zoom |
| 1.4.0     | 20   | com.ascension.fitness       | 2026-09-05 | Form-analysis capture and voice logging. Film a set or pick a video, choose which 3 minutes are analysed. Native change — built `--clean` |
| 1.1.0     | 17   | com.ascension.fitness       | 2026-09-03 | 30 per-tier character icons; fixes Hunter/ranking showing raw E–S ranks; Ascension moved to top of Profile         |
| 1.0.0     | 16   | com.ascension.fitness       | 2026-09-03 | Character select at launch, animated sigils, motivational lines per Ascension                                      |
| 0.9.0     | 15   | com.ascension.fitness       | 2026-09-03 | **Renamed Ascension.** Ascension themes, faster launch, premium transitions. New package: install is NOT an update |
| 0.7.0     | 13   | com.arise.fitness           | 2026-09-03 | Athlete profiles from the ranking; post-workout comparison; History back in the bar. **Leaderboard opt-ins reset** |
| 0.6.0     | 12   | com.arise.fitness           | 2026-09-03 | Cardio logging fixed (server-side); 5 tabs not 7; tab-press flourish and sound. Native change — built `--clean`    |
| 0.5.0     | 11   | com.arise.fitness           | 2026-09-02 | **Training insights** — volume, sets and sessions per muscle group against the previous period, with bars          |
| 0.4.3     | 10   | com.arise.fitness           | 2026-09-02 | Barcode scanner: green reticle, decoded digits shown, manual entry, food source displayed                          |
| 0.4.2     | 9    | com.arise.fitness           | 2026-09-02 | Cardio now visible and loggable (minutes/km inputs); 16 machines added                                             |
| 0.4.1     | 8    | com.arise.fitness           | 2026-09-02 | 28 manifest permissions down to 11 — launcher badge and attribution entries removed                                |
| 0.4.0     | 7    | com.arise.fitness           | 2026-09-02 | **Renamed ARISE.** New icon and palette, launch screen, cardio tracking. New package: install is NOT an update     |
| 0.3.1     | 5    | com.fitnessintellisense.app | 2026-09-01 | Security: allowBackup off, password rules, drizzle CVE, CI fixed                                                   |
| 0.3.0     | 4    | com.fitnessintellisense.app | 2026-09-01 | Movement demos, tier strip, email verification, password reset, nutrition + barcode                                |
| 0.2.0     | 3    | com.fitnessintellisense.app | 2026-09-01 | The Hunter System — levels, ranks, quests, badges, leaderboard                                                     |

> **Codes 18 and 19 have no rows.** The previous "Current build" block recorded
> 1.3.0 / 19 as shipped, so those builds happened and were not logged here. The
> rows are not reconstructed from memory: an invented changelog is worse than a
> visible gap, because it reads exactly like a real one. What 1.2.0 and 1.3.0
> contained is recoverable from git history if it is ever needed.
>
> **Codes 22 to 28 have no rows either**, and for the same reason. The APKs
> exist in this directory — 1.6.0 through 1.9.1 — so those builds happened; the
> log simply was not kept, and the "Current build" block below sat at 1.5.0
> through all seven of them. Filling them in now would mean guessing, so they
> stay a visible gap.

### Why 1.9.2 exists

**Because 1.9.1 could not be updated.** The `Ascension-1.9.1.apk` in this
directory was cut on 2026-09-06 at 02:24, and `GoogleSignInButton.tsx` changed
after it (69fc740, 08:07 the same day). So a rebuild would have carried
different code under an identical `versionCode` of 28 — which Android refuses
to install over an existing 1.9.1, with a confusing error. Bumping to 29 is
what makes the binary installable; that is the whole content of this release.

The change itself is web-only in effect. Google sign-in for the browser moved
into its own `GoogleSignInButton.web.tsx` using Google Identity Services, and
the native button consequently lost two dead `Platform.OS === 'web'` branches.
On Android that is a no-op, and it is written down as one rather than dressed
up: this row is a version bump, not a feature.

Nothing from the analyzer work of 2026-09-07/08 is in here. `services/analyzer`
is a Python service that does not ship inside the APK.

**The package has changed twice, and each time cost every user a reinstall.**
Android identifies an app by its package, so a new one is a new app: it cannot
update in place, and both can sit on a phone at once.

- **0.4.0** — `com.fitnessintellisense.app` → `com.arise.fitness`. Agreed while
  only one device had it installed.
- **0.9.0** — `com.arise.fitness` → `com.ascension.fitness`. This one landed
  while 0.7.0 was already on other people's phones, so everyone had to remove
  it and install fresh. Nothing was lost, because all data is server-side, but
  they had to sign in again.

After a Play Store listing the package is permanent, so there is no third time.

The column above is the historical record and is **not** rewritten when the
package changes: 0.4.0 through 0.7.0 really did ship as `com.arise.fitness`,
and saying otherwise would destroy the only account of which binary carried
which id.

## Current build

|                           |                                                                    |
| ------------------------- | ------------------------------------------------------------------ |
| File                      | `Ascension-1.9.2.apk`                                              |
| Package                   | `com.ascension.fitness`                                            |
| versionName / versionCode | 1.9.2 / 29                                                         |
| Size                      | 76,010,689 bytes (72.5 MB)                                         |
| SHA-256                   | `fcef641d27501c7898a89fec16daef6c620f3fa6793de21fabaf2ef64d23aed0` |
| **Signing cert SHA-256**  | `c35574e619810ce487e6e92d2e3cbabced3e85356f32e4d793183335a0fee5de` |
| API                       | `https://fitnellisense.onrender.com`                               |
| ABIs                      | arm64-v8a, armeabi-v7a                                             |
| Manifest permissions      | 13 (unchanged since 1.5.0)                                         |
| allowBackup               | `false`                                                            |

The certificate is unchanged from 1.3.0, so this installs over an existing copy
as an update. Verified with `apksigner`, not assumed — the digest above was
read off this binary, and it matches the one this table has carried since 1.5.0.

**This block was stale at 1.5.0 for seven releases.** It is the table an
existing install's updatability depends on, so it going unmaintained is worse
than the missing changelog rows: a changed signing identity would have gone
unnoticed. Updated here, and worth updating on every build.

**RECORD_AUDIO is present from 1.5.0, and that is a real change.** In-app voice
logging needs it; it was blocked in three separate places before (the
`blockedPermissions` list, expo-image-picker`s `microphonePermission: false`,
and expo-camera`s `recordAudioAndroid`), so the button would have shipped dead.
The privacy policy was amended in the same commit — it previously said the
microphone was never used. Set video still records muted.

Still absent, and checked against this binary rather than the config:

```bash
aapt dump badging build-output/Ascension-1.9.2.apk | grep -iE 'READ_MEDIA|EXTERNAL_STORAGE'
# no output
```

## The check that matters before every release

```bash
# apksigner is not on PATH and needs a JDK. It ships with the SDK build-tools:
JAVA_HOME="I:/android-toolchain/jdk-17.0.20.1+1" \
  /i/android-toolchain/sdk/build-tools/36.0.0/apksigner.bat \
  verify --print-certs build-output/Ascension-1.9.2.apk
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
# 5. Attach build-output/Ascension-<version>.apk to a GitHub Release tagged v<version>
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
