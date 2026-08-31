# Fitness Intellisense

A cross-platform workout tracker built to be excellent at the boring part first:
fast, reliable logging on Android and on the web, from one codebase — with the
foundations in place for AI advisory insights and computer-vision form analysis
later.

The full specification is `docs/BRD.md` (frozen at v0.1). Agent instructions are
in `CLAUDE.md`.

## The golden path

Register → find an exercise → build a routine → log a workout with sets and reps
→ see your progress on that exercise over time. No data loss, no dead ends. That
is what v1 means, and `apps/api/tests/golden-path.integration.test.ts` walks it
end to end.

## Layout

```
apps/api          Fastify + Drizzle + Postgres. Thin routes, logic in services/.
apps/mobile       Expo Router app — Android and web from one codebase.
packages/shared   Zod schemas; every wire type is derived from them.
packages/domain   Pure business logic: decimals, 1RM, volume, records, streaks.
content/          exercises.seed.json — 169 exercises as reviewable data.
docs/             BRD, runbook, QA checklist, architecture decisions.
```

## Running it

Requires Node 20+, pnpm 10, and a Postgres (Neon's free tier is what this is
built for).

```bash
pnpm install
cp apps/api/.env.example apps/api/.env    # fill DATABASE_URL and the two secrets
pnpm db:migrate
pnpm db:seed
pnpm dev:api                              # http://localhost:3000/health
pnpm dev:mobile                           # press 'w' for web, 'a' for Android
```

`docs/runbook.md` has the details, including how to make yourself an admin.

## Checks

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Integration tests need a database and skip without one:

```bash
TEST_DATABASE_URL=postgresql://... pnpm --filter @fi/api test
```

CI runs everything, including the integration suite against a real Postgres.

## A few decisions worth knowing before you change anything

- **Weights are kilograms, as exact decimals, everywhere.** Conversion happens
  at the point of display and nowhere else. `packages/domain/src/decimal.ts`
  holds values as integer hundredths behind a branded type, so a float weight
  does not typecheck.
- **Business arithmetic lives in `packages/domain` only.** It is pure, has no
  imports from any framework, and is held at 100% branch coverage. This is also
  what will make the Phase 4 AI boundary real: the model phrases numbers it is
  given, it never computes one.
- **Media is never a URL string.** Every asset is a `media_assets` row with a
  source and a licence, and four database CHECK constraints make an unlicensed
  asset structurally incapable of being rendered. v1 ships without demonstration
  media rather than with media whose licence we cannot state — see
  `docs/adr/0003-media-in-v1.md`.
- **Set logging is optimistic.** The UI updates first and reconciles after. It
  never waits on the network.
- **Timers derive from an end timestamp, never a counter,** so they survive
  backgrounding on both platforms.
- **`/admin/*` answers 404 to non-admins,** so the namespace is not enumerable.

## Status

Milestone 0 and Phases 1–2 are built: schema and migrations, the seeded
catalogue, auth with rotating refresh tokens, the admin namespace with media
provenance and the content round-trip, routines, the live workout engine with
prefill and rest timer, history, records, and progress charts — on Android and
web.

Phase 3 is next: the local store and offline outbox, the account-deletion grace
job, backups with a rehearsed restore, and the cross-platform sweep.
