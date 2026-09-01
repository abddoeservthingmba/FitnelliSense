# Runbook

Operational procedures for Fitness Intellisense. BRD §11, §7.7, NFR-D-06,
NFR-B-03.

Anything marked **UNVERIFIED** has been written but not yet performed. Milestone
0 is not complete until the deploy, rollback and restore procedures have each
been run at least once and marked verified here, with the date.

---

## 1. Local development

```bash
pnpm install
cp apps/api/.env.example apps/api/.env     # then fill DATABASE_URL and the secrets
pnpm db:migrate                            # forward-only
pnpm db:seed                               # loads content/exercises.seed.json
pnpm dev:api                               # http://localhost:3000
pnpm dev:mobile                            # press 'w' for web, 'a' for Android
```

Generate the two secrets with `openssl rand -base64 48` (or
`node -e "console.log(require('crypto').randomBytes(36).toString('base64'))"`).

Verify the API is up and identifiable:

```bash
curl -s http://localhost:3000/health | jq
curl -s http://localhost:3000/health/deep | jq   # checks DB and R2
```

`/health` answers without a database. `/health/deep` returns 503 when Postgres
is unreachable, and reports R2 as `degraded` rather than `down` when R2 is simply
not configured — media then degrades to placeholders (NFR-B-06).

### Making yourself an admin (Q14)

There is no self-service admin signup. Register normally, then:

```sql
UPDATE users SET is_admin = true WHERE email = 'you@example.com';
```

Sign in again afterwards — `isAdmin` is a claim inside the access token, so an
existing token stays non-admin until it is reissued.

---

## 2. Migrations

Forward-only, and reviewed by hand (BRD §16.4 — Drizzle diffs can silently drop
columns).

```bash
pnpm db:generate            # writes SQL into apps/api/src/db/migrations
# READ THE GENERATED SQL. Every line.
pnpm db:migrate             # applies it
```

Per NFR-D-03, a column change is spread across releases: add column → deploy code
that writes it → backfill → remove the old column in a *later* release. Never
drop and deploy in one step.

Run against staging first (§11.2). Neon branching makes that cheap.

---

## 3. Content changes (FR-ADM-07)

The catalogue is data, not code, and round-trips:

```bash
pnpm content:export     # live catalogue -> content/exercises.seed.json
git diff content/       # review it like any other change
pnpm content:import     # idempotent; safe to re-run
```

Import is keyed on slugs, so re-running updates rather than duplicating. A seed
file whose media lacks a stated licence fails to parse (FR-MED-10).

---

## 4. Deploy

**Production is live** at https://fitnellisense.onrender.com (service
`srv-dab6f9n40ujc739vl8u0`, free plan, Singapore). Q13 (custom domain) and Q15
(Neon plan) remain open; see `adr/0002-infrastructure-tiers.md`.

Two things differ from the blueprint because the free plan does not support
pre-deploy commands: migrations run at the end of the **build** command
instead, and there is no separate pre-deploy step. Build-time still satisfies
NFR-D-03 — the schema advances before the new code serves traffic.

### API (Render)

1. Connect the repository; root directory `apps/api`.
2. Build: `pnpm install --frozen-lockfile && pnpm --filter @fi/api build`
3. Start: `node dist/index.js`
4. Environment: every key in `apps/api/.env.example`. `COMMIT_SHA` must be the
   real commit — the process refuses to boot in production with `COMMIT_SHA=local`
   (NFR-D-05).
5. `CORS_ORIGINS` must list the exact web origins for that environment. A
   wildcard outside development makes the process refuse to start (§12.3).
6. Health check path: `/health`.
7. Migrations run as a pre-deploy step: `node dist/migrate.js`.

Production is promoted manually, never automatically on merge (§11.2).

### Web (Cloudflare Pages)

1. Build: `pnpm install --frozen-lockfile && pnpm --filter @fi/mobile build:web`
2. Output directory: `apps/mobile/dist`
3. Set `EXPO_PUBLIC_API_URL` to that environment's API origin.

### Android (EAS)

Profiles live in `apps/mobile/eas.json`:

| Profile | Output | Points at | Use |
|---|---|---|---|
| `development` | APK, dev client | `10.0.2.2:3000` (the emulator's host) | Daily work against a local API |
| `preview` | **APK**, installable directly | `EXPO_PUBLIC_API_URL` in the profile | Internal testing on a real phone |
| `production` | AAB | ditto | Play Store |

**Before the first build**, two things are required and neither can be done
from the repository:

1. **An Expo account.** `eas login`, or set `EXPO_TOKEN` for CI. Then `eas init`
   once, which writes `extra.eas.projectId` into `app.json` — commit that.
2. **A deployed API URL.** Replace the `example.com` placeholders in
   `eas.json` with the real hosts. An APK is useless without one: the app
   refuses to start if a release build resolves to `localhost`, `127.0.0.1` or
   `10.0.2.2` (see `apps/mobile/src/api/config.ts`), because the alternative is
   an app that installs, opens, and then silently fails every request.

Then:

```bash
cd apps/mobile
pnpm build:apk          # cloud build; prints a download link when it finishes
pnpm build:apk:local    # same, on this machine — needs a JDK and the Android SDK
```

#### Building the APK with no Expo account

`expo prebuild` plus Gradle needs no Expo account at all. The toolchain used
here lives at `I:\android-toolchain` and is self-contained — nothing was
installed system-wide:

```bash
export JAVA_HOME="I:\\android-toolchain\\jdk-17.0.20.1+1"
export ANDROID_HOME="I:/android-toolchain/sdk"
export ANDROID_KEYSTORE_PATH="I:/Fitness Intellisense/apps/mobile/credentials/release.keystore"
export ANDROID_KEYSTORE_PASSWORD=...      # not in the repo
export ANDROID_KEY_ALIAS=fitness-intellisense
export EXPO_PUBLIC_API_URL="https://<the deployed API>"

cd apps/mobile
npx expo prebuild --platform android --no-install --clean
printf 'sdk.dir=I:/android-toolchain/sdk\n' > android/local.properties
cd android
"/i/android-toolchain/gradle-9.3.1/bin/gradle.bat" assembleRelease --no-daemon \
  -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
```

The APK lands in `android/app/build/outputs/apk/release/`.

Three things about this environment that will bite anyone repeating it:

1. **Kaspersky Endpoint Security intercepts TLS on this machine.** Its CA has
   to be imported into the JDK's truststore or every Gradle download fails with
   `PKIX path building failed`. Extract it with
   `openssl s_client -connect services.gradle.org:443 -showcerts` and import it
   with `keytool -importcert -cacerts`. This is also why `npx expo install`
   fails here with "self-signed certificate in certificate chain".
2. **The Gradle wrapper cannot download Gradle** — its CDN times out from the
   JVM even though `curl` reaches it. A standalone Gradle distribution is used
   instead of `./gradlew`.
3. **Architectures are restricted to `arm64-v8a,armeabi-v7a`**, which halves the
   APK (101 MB → 58 MB) by dropping the x86 slices. Real phones are covered;
   **an x86 emulator is not**. Drop the flag if you need one.

Minification stays off. ProGuard on React Native breaks reflection-based code
in ways that only appear at runtime, and there is no device here to verify
against — the architecture split is the bigger win and carries no such risk.
Revisit with a device and a pass through `docs/qa.md`.

#### The signing key

`apps/mobile/credentials/release.keystore` is generated, gitignored, and **not
backed up anywhere**. Losing it means never being able to ship an update to an
already-installed app; leaking it means someone else can publish as you. Copy
it somewhere safe before the first Play Store release, along with its password.

The CORS allowlist does **not** need the app's origin: native Android sends no
`Origin` header and is not subject to CORS (NFR-C-07). Only the web build's
origin belongs in `CORS_ORIGINS`.

App icons are generated, not committed as opaque binaries:

```bash
pnpm icons   # regenerates assets/ from scripts/generate-icons.mjs
```

Play Store submission is a Phase 3 exit item, not earlier.

---

## 5. Rollback (NFR-D-06)

**UNVERIFIED** — must be performed once before Milestone 0 is complete.

1. Render dashboard → the service → Deploys → the previous successful deploy →
   **Redeploy**.
2. Confirm with `curl -s https://<api-host>/health | jq .commit` — it must show
   the commit you rolled back to.
3. If the rolled-back code predates the current schema, remember that migrations
   are forward-only: the schema stays. This is exactly why NFR-D-03 forbids
   dropping a column in the same release that stops writing it.

Record here when first performed: _date, commit rolled back from and to._

---

## 6. Backup and restore (NFR-B-02, NFR-B-03)

**NOT YET IMPLEMENTED** — Phase 3, and a Phase 3 exit criterion.

Intended shape:

```bash
# Weekly, to R2 under $R2_BACKUP_PREFIX, with its own lifecycle policy
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl \
  | aws s3 cp - "s3://$R2_BUCKET/$R2_BACKUP_PREFIX/$(date -u +%Y-%m-%d).dump" \
      --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"
```

Restore rehearsal, which is the part that matters (R14 — a backup that has never
been restored is not a backup):

1. Create a fresh Neon branch.
2. `pg_restore` the newest dump into it.
3. Point a local API at the branch; sign in; confirm a known workout's sets are
   intact.
4. Record the wall-clock time taken here, as the measured RTO.

Record here when first performed: _date, dump restored, time taken._

---

## 7. Incident triage

Start from the correlation ID. Every response carries `X-Request-Id`, every log
line for that request carries it, and the error state in the app shows it to the
user as a reference (NFR-O-04, NFR-O-05).

| Symptom | Likely cause | Check |
|---|---|---|
| First request after idle is slow, then fine | Neon compute resuming (expected, R1) | `/health/deep` latency on the `database` dependency |
| `SERVICE_UNAVAILABLE` from many endpoints | Postgres unreachable | `/health/deep` → `database: down`. The client treats this as offline (NFR-B-08) |
| Exercise images missing, everything else fine | R2 unconfigured or unreachable | `/health/deep` → `r2: degraded`. Expected behaviour, not an incident (NFR-B-06) |
| Web app fails, Android app fine | CORS — nearly always | Compare the browser's `Origin` against `CORS_ORIGINS`. Native sends no `Origin` and is not subject to CORS (NFR-C-07) |
| Direct browser upload to R2 fails | Bucket CORS is configured separately from the API's | R2 bucket CORS policy (NFR-C-09) |
| Process exits at boot with code 78 | Invalid configuration | The `ConfigError` message lists every offending key at once |
| `409 CONFLICT` on starting a workout | The user already has one in progress | Expected (FR-WK-02). The client should offer to resume |
| `409` on a repeated mutation | Same `Idempotency-Key`, different body | A client bug, not a server one (§10.2) |

Logs never contain emails, tokens or request bodies (NFR-O-10). The user is
identified by a salted hash of their id, so activity can be correlated without
identifying anyone from the logs alone.

---

## 8. Account deletion (FR-AUTH-10, NFR-B-05)

`DELETE /me` revokes every refresh token, marks the user deleted and anonymises
the email immediately. The 30-day grace job that hard-deletes rows and R2 objects
is **not yet implemented** — Phase 3, task 23. Until it exists, deletion is a
soft delete plus anonymisation, which does not yet satisfy FR-AUTH-10 in full.
