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

### Running the integration tests

**The integration suites `TRUNCATE` every table in the database
`TEST_DATABASE_URL` names.** It must never be the same database as
`DATABASE_URL`. Without the variable set, those suites skip and the unit tests
still run — which is the safe default, not a degraded one.

A separate database on the same Neon project is enough isolation and costs
nothing:

```bash
# Once. Note the direct endpoint: CREATE DATABASE cannot run through the
# transaction pooler, so strip "-pooler" from the host.
psql "$(echo "$DATABASE_URL" | sed 's/-pooler\.//')" -c 'CREATE DATABASE fi_test'
```

Then set `TEST_DATABASE_URL` to the same string with the database name replaced
(`/neondb?` → `/fi_test?`) and run `pnpm test`. The suite migrates it on the
first run.

### Email (verification and password reset)

Email is optional configuration. With `RESEND_API_KEY` unset the API boots,
logs `RESEND_API_KEY is not set …` once, and both code endpoints keep answering
`202` while delivering nothing — the client reads `deliveryConfigured: false`
and says so rather than sending the user to an empty inbox.

To switch it on:

1. resend.com → **API Keys** → **Create**. Set `RESEND_API_KEY`.
2. resend.com → **Domains** → add and verify the sending domain, then set
   `EMAIL_FROM` to an address on it, e.g. `Fitness Intellisense <no-reply@example.com>`.

Until a domain is verified, Resend's sandbox sender (`onboarding@resend.dev`,
the default) delivers **only to the Resend account owner's address**. That is
enough to test the flow end to end and useless for real users, so do not ship
without step 2.

**Current state (2026-09-01):** `RESEND_API_KEY` and `EMAIL_FROM` are set on
Render and production reports `deliveryConfigured: true`. `EMAIL_FROM` is still
the **sandbox sender**, so codes reach only the Resend account owner — step 2 is
outstanding. Note that Render's single-env-var API updates the stored config
without restarting the process: a `POST /v1/services/{id}/deploys` is needed
afterwards, or the running instance keeps the old environment and
`deliveryConfigured` stays `false` while the dashboard shows the key set.

The key is a **send-only restricted key**, which is the right scope — it cannot
list or modify domains. A quick way to tell a valid restricted key from a bad
one without emailing anybody: `GET https://api.resend.com/domains` returns
`restricted_api_key` for a valid send-only key and `invalid_api_key` for a bad
one.

Codes last `OTP_TTL` (15m), allow five wrong guesses, and requesting a new one
retires the previous one.

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
that writes it → backfill → remove the old column in a _later_ release. Never
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

This is the live configuration, not an example. **Root directory is the
repository root, not `apps/api`** — it is a pnpm workspace and the install has
to run from the top.

| Setting           | Value                                                                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root Directory    | _(empty)_                                                                                                                                            |
| Build Command     | `corepack enable && pnpm install --frozen-lockfile --prod=false --filter @fi/api... && pnpm --filter @fi/api build && node apps/api/dist/migrate.js` |
| Start Command     | `node apps/api/dist/index.js`                                                                                                                        |
| Health Check Path | `/health`                                                                                                                                            |

Three parts of that build command each exist for a reason:

- `--filter @fi/api...` installs the API and the two workspace packages it
  depends on. Without it, the Expo app's dependency tree comes too — hundreds
  of megabytes the server never uses.
- `--prod=false` is required because Render sets `NODE_ENV=production`, under
  which pnpm skips devDependencies. The build needs `tsup`, so without this it
  fails on a missing binary with no obvious connection to the cause.
- The trailing `migrate.js` is where migrations run, since the free plan has no
  pre-deploy step.

Environment: every key in `apps/api/.env.example`. Two notes:

- **Leave `COMMIT_SHA` unset.** Config reads Render's `RENDER_GIT_COMMIT`
  automatically, and NFR-D-05 refuses to boot a production build without one.
- `CORS_ORIGINS` is an exact-match allowlist (§12.1). The Android app needs no
  entry — native sends no `Origin` header (NFR-C-07). Add the web app's origin
  when it is deployed.

**If a deploy fails with a Yarn/Corepack error**, the Start Command is empty and
Render has fallen back to its default `yarn start`. Yarn 1.x refuses to run any
script when `packageManager` names pnpm, and reports it as
`"yarn@pnpm@10.34.5"` — its own formatting, not a corrupted field.

Production is promoted manually, never automatically on merge (§11.2).

### Web (Cloudflare Pages)

1. Build: `pnpm install --frozen-lockfile && pnpm --filter @fi/mobile build:web`
2. Output directory: `apps/mobile/dist`
3. Set `EXPO_PUBLIC_API_URL` to that environment's API origin.

### Android (EAS)

Profiles live in `apps/mobile/eas.json`:

| Profile       | Output                        | Points at                             | Use                              |
| ------------- | ----------------------------- | ------------------------------------- | -------------------------------- |
| `development` | APK, dev client               | `10.0.2.2:3000` (the emulator's host) | Daily work against a local API   |
| `preview`     | **APK**, installable directly | `EXPO_PUBLIC_API_URL` in the profile  | Internal testing on a real phone |
| `production`  | AAB                           | ditto                                 | Play Store                       |

The APK is built locally (next section), so no Expo account is needed.
`eas.json` points preview and production at the deployed API.

A release build that resolves to `localhost`, `127.0.0.1` or `10.0.2.2`
refuses to start — see `apps/mobile/src/api/config.ts`. The alternative is an
app that installs, opens, and then silently fails every request, with nothing
on the device to explain why.

The EAS cloud path needs an Expo account (`eas login`, then `eas init` once):

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

| Symptom                                       | Likely cause                                        | Check                                                                                                                 |
| --------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| First request after idle is slow, then fine   | Neon compute resuming (expected, R1)                | `/health/deep` latency on the `database` dependency                                                                   |
| `SERVICE_UNAVAILABLE` from many endpoints     | Postgres unreachable                                | `/health/deep` → `database: down`. The client treats this as offline (NFR-B-08)                                       |
| Exercise images missing, everything else fine | R2 unconfigured or unreachable                      | `/health/deep` → `r2: degraded`. Expected behaviour, not an incident (NFR-B-06)                                       |
| Web app fails, Android app fine               | CORS — nearly always                                | Compare the browser's `Origin` against `CORS_ORIGINS`. Native sends no `Origin` and is not subject to CORS (NFR-C-07) |
| Direct browser upload to R2 fails             | Bucket CORS is configured separately from the API's | R2 bucket CORS policy (NFR-C-09)                                                                                      |
| Process exits at boot with code 78            | Invalid configuration                               | The `ConfigError` message lists every offending key at once                                                           |
| `409 CONFLICT` on starting a workout          | The user already has one in progress                | Expected (FR-WK-02). The client should offer to resume                                                                |
| `409` on a repeated mutation                  | Same `Idempotency-Key`, different body              | A client bug, not a server one (§10.2)                                                                                |

Logs never contain emails, tokens or request bodies (NFR-O-10). The user is
identified by a salted hash of their id, so activity can be correlated without
identifying anyone from the logs alone.

---

## 8. Account deletion (FR-AUTH-10, NFR-B-05)

`DELETE /me` revokes every refresh token, marks the user deleted and anonymises
the email immediately. The 30-day grace job that hard-deletes rows and R2 objects
is **not yet implemented** — Phase 3, task 23. Until it exists, deletion is a
soft delete plus anonymisation, which does not yet satisfy FR-AUTH-10 in full.
