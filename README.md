# Fitness Intellisense

A cross-platform workout tracker built to be excellent at the boring part first:
fast, reliable logging on Android and on the web, from one codebase — with
measured form analysis and deterministic training insights layered on top of it
rather than in place of it.

The repository is `fitness-intellisense`. **The app ships as Ascension**
(`com.ascension.fitness`), renamed at 0.9.0; both names are correct and refer to
the same thing.

The specification is `docs/BRD.md` (frozen at v0.1) plus
`docs/BRD-v0.2-scope-extension.md`. Requirement IDs — `FR-*`, `NFR-*` — are the
contract, and commits reference them. Agent instructions are in `CLAUDE.md`.

## Where it stands

**Live in production.** The API serves real traffic, the Android build is
installable, and the analysis pipeline reaches a result instead of stopping at
`queued`.

| Piece           | Where it runs                                | Notes                                           |
| --------------- | -------------------------------------------- | ----------------------------------------------- |
| API             | Render, free instance                        | `fitnellisense.onrender.com`, cold-starts       |
| Database        | Neon Postgres, free tier                     | 20 migrations applied, forward-only             |
| Storage         | Cloudflare R2                                | Video, avatars, catalogue media                 |
| Web app         | Netlify — `ascension.netlify.app`            | Deployed by hand; auto-build is off, on purpose |
| Android         | APK 1.9.2 (`versionCode` 29)                 | GitHub Releases, not committed                  |
| Analysis worker | **A developer's laptop, against production** | Deliberate interim answer — see below           |

### Built

- **Milestone 0, Phase 1, Phase 2** — schema and migrations, the seeded
  catalogue (188 exercises with verified provenance), auth with rotating refresh
  tokens, Google sign-in, the admin namespace, routines, the live workout engine
  with prefill and rest timer, history, PR detection, progress charts. On Android
  and web. `apps/api/tests/golden-path.integration.test.ts` walks it end to end.
- **Phase 4, the half that matters** — plateau, progression, imbalance and
  adherence detection, all deterministic, all in `packages/domain` at 100% branch
  coverage. `insights-service.ts` fetches rows and computes nothing.
  **No model is involved anywhere yet**, and nothing here needs phrasing to be
  useful (FR-AI-04, FR-AI-09).
- **Phase 5, through measurement** — presigned upload, consent, the analysis row
  and its states, the Python analyzer, and the worker that claims a `queued` row
  and writes a result. Rep count, per-rep range of motion and tempo, concentric
  velocity, velocity loss, bar drift and straightness — every one measured, none
  guessed.
- **BRD v0.2 scope extension** — the Hunter system and ranking, the leaderboard
  with opt-in, and nutrition with barcode scanning and targets.
- **Beyond both documents** — voice logging (`FR-VOX-*`), video capture and
  trimming (`FR-VID-*`), cardio, Ascension character select, data export and
  account deletion.

### Not built

- **The offline outbox and local store (Phase 3).** The API side is ready — the
  idempotency plugin exists precisely so a replayed write is safe — and set
  logging is already optimistic in the UI. What is missing is the client store
  that survives a process kill and replays on reconnect. `NFR-R-03` is the
  requirement; the comments in `workout-service.ts` and `hunter-service.ts`
  anticipate it.
- **Form findings and a score.** Pose, kinematics, rules and scoring are stages
  2–5 and 8–11 of the analyzer. What ships measures the bar; it does not judge
  the lift.
- **LLM phrasing of insights.** Permitted by FR-AI-09, not wired up.

## The golden path

Register → find an exercise → build a routine → log a workout with sets and reps
→ see your progress on that exercise over time. No data loss, no dead ends. That
is what v1 means, and it is the one journey that has an end-to-end test of its
own.

## Layout

```
apps/api          Fastify + Drizzle + Postgres. Thin routes, logic in services/.
apps/mobile       Expo Router app — Android and web from one codebase.
apps/worker       Claims queued analyses, runs the analyzer, writes results.
packages/shared   Zod schemas; every wire type is derived from them.
packages/domain   Pure business logic — 23 modules, each with its test beside it.
services/analyzer Python. Tracks the bar and emits a PATH — nothing more.
content/          exercises.seed.json — the catalogue as reviewable data.
docs/             BRD, runbook, QA checklist, security notes, six ADRs.
```

## Three seams worth understanding

**The analyzer emits a path; the domain computes the numbers.**
`services/analyzer` tracks a point through frames and stops there.
`packages/domain/src/bar-path.ts` turns that pixel path into metres, reps and
velocities. Recomputing metres in Python would put the same arithmetic in two
languages against the project's own rule, and it would be the worse copy. The
one verdict that does cross the seam is the **abstention** — whether the bar was
followed well enough to measure at all — because only the tracking side can say
that. `apps/worker/README.md` covers this properly.

**AI is never a source of truth.** Every number is computed in
`packages/domain` and passed to a model as context. A model writes only to
`ai_insights` (BRD §8.4). This is why Phase 4's deterministic half was built
first and is useful on its own.

**The queue is a column.** No Redis, no Kafka, no Docker (BRD §3.3.1) and none
is needed. `status = 'queued'`, claimed with a conditional `UPDATE ... FOR
UPDATE SKIP LOCKED`, which is atomic on its own and safe if two workers ever
race. The cost is a poll — 60 seconds by default, because a five-second poll
keeps Neon's compute awake around the clock and spends the free allowance on
finding nothing to do.

## Running it

Node 20–24, pnpm 10, and a Postgres. Neon's free tier is what this is built for.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env    # DATABASE_URL and the two secrets
pnpm db:migrate
pnpm db:seed
pnpm dev:api                              # http://localhost:3000/health
pnpm dev:mobile                           # 'w' for web, 'a' for Android
```

The worker needs a Python interpreter with the analyzer's pinned dependencies —
`make setup` in `services/analyzer`, which deliberately puts the virtualenv
outside the repo because opencv, mediapipe, scipy and numpy come to about half a
gigabyte.

```bash
cp apps/worker/.env.example apps/worker/.env
pnpm dev:worker                           # poll until stopped
pnpm worker:once                          # claim one clip, work it, exit
```

`worker:once` is the useful one when checking a change: a bad deployment cannot
chew through a backlog.

`docs/runbook.md` has the rest, including how to make yourself an admin.

## Checks

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Integration tests need a database and skip without one. Set
`TEST_DATABASE_URL` and they run — and note that they **truncate every table**
in whatever database it names, so it must never be `DATABASE_URL`.

```bash
TEST_DATABASE_URL=postgresql://... pnpm test
```

CI always provides one, so the integration suites always run there.

## Content and releases

```bash
pnpm content:export   # live catalogue -> content/exercises.seed.json
pnpm content:import   # idempotent re-import
pnpm apk              # prebuild, Gradle, sign, copy into build-output/
```

`pnpm apk` refuses to run without `apps/mobile/credentials/keystore.env`,
because Gradle otherwise falls back to the debug key without saying so and the
resulting APK cannot install over anything. `build-output/README.md` is the
version log, and it is tracked precisely so a **changed signing certificate is
visible in a pull request** rather than discovered by a user whose update
refuses to install.

## Decisions worth knowing before you change anything

- **Weights are kilograms, as exact decimals, everywhere.** Conversion happens
  at the point of display and nowhere else. `packages/domain/src/decimal.ts`
  holds values as integer hundredths behind a branded type, so a float weight
  does not typecheck.
- **Business arithmetic lives in `packages/domain` only.** Pure, no framework
  imports, 100% branch coverage. This is what makes the AI boundary real: the
  model phrases numbers it is given, it never computes one.
- **Every query is scoped by the authenticated `user_id`.** No exceptions.
- **Media is never a URL string.** Every asset is a `media_assets` row with a
  source and a licence, and four database CHECK constraints make an unlicensed
  asset structurally incapable of being rendered. See `docs/adr/0003` and
  `0004`.
- **Set logging is optimistic.** The UI updates first and reconciles after. It
  never waits on the network.
- **Timers derive from an end timestamp, never a counter,** so they survive
  backgrounding on both platforms.
- **Exercises and routines are archived, never hard-deleted.**
- **`/admin/*` answers 404 to non-admins,** so the namespace is not enumerable.
- **CORS origins are an exact-match allowlist from env,** and the API refuses to
  start with a wildcard outside development. **Verify CORS changes in a
  browser** — native Android sends no `Origin` header at all, so the whole suite
  passes against a configuration no browser would accept.
- **Google sign-in carries no client secret,** because the app is a public
  client that could not keep one. Verification uses Google's public keys and
  checks the token's audience, which is the check that makes the other four
  worth doing. `apps/api/src/lib/google.ts` is a security boundary and says so.
- **Never log PII, tokens, emails or raw request bodies.** Every request has a
  correlation ID, logged on every line and echoed in the response.

## Known gaps

Recorded here rather than discovered later.

- **Analysis is unavailable when the worker's machine is off.** ffmpeg and
  OpenCV do not fit Render's free instance and background workers are a paid
  plan, so the alternatives were to spend money or leave the feature
  unavailable. Clips still upload and are still kept; they wait in `queued`,
  which is the state that row was designed to express. Being killed mid-clip is
  survivable — see `requeueAbandoned`.
- **A clip whose analysed window is not the whole file is refused.** Honouring
  the window needs the decoder to skip frames, which it does not do yet, and
  analysing the whole file instead would measure a part of the video the lifter
  did not choose.
- **Analyzer runtime is about two minutes for a one-minute clip,** against a
  45-second target.
- **Two production rows sit in `queued` with `analysis_requested = false`.**
  They predate migration 0018, so the worker will never claim them and the
  client shows them as queued forever. `stored_only` is the state they belong
  in; moving them is a one-line update to live data.
- **The Android OAuth client's SHA-1 is not recorded anywhere.**
  `build-output/README.md` tracks the APK signing certificate as a SHA-256
  digest, which is the right fingerprint for checking updatability but is not
  the one Google's console takes. Re-keying the app breaks Google sign-in on
  Android until the new fingerprint is registered.
- **Netlify auto-deploy is off** because build minutes are nearly spent. Deploy
  with `pnpm --filter @fi/mobile deploy:web`, which builds locally and uploads a
  finished directory. The APK is the primary channel.

## Governance

BRD v0.1 is frozen, and v0.2 extended scope rather than editing it. From here:
a new feature idea is a PRD, a new technical decision is an ADR in
`docs/adr/`, and a changed requirement is a new BRD version with a changelog
entry — not an in-place edit. That is what keeps the document short enough that
people keep reading it.
