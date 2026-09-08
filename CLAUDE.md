# Project: Fitness Intellisense

Read `docs/BRD.md` before starting any task. Requirement IDs (FR-*, NFR-*) are
the contract — reference them in commits and PR descriptions.

## Non-negotiables

- Weights are stored and transmitted in KILOGRAMS as decimals. Never floats.
  Convert only in the presentation layer. `packages/domain/src/decimal.ts` is
  the only place decimal arithmetic happens.
- Every DB query is scoped by the authenticated `user_id`. No exceptions.
- Domain logic (1RM, volume, PR detection, unit conversion, prefill, streaks)
  lives ONLY in `packages/domain` and is pure and unit-tested at 100% branch
  coverage. Never inline it in a route or a component.
- Set logging is optimistic. The UI must never wait on the network.
- TypeScript strict. No `any`. No unchecked non-null assertions.
- Zod schemas live in `packages/shared` and are the single source of truth for
  types. Derive types with `z.infer`; do not hand-write duplicates.
- Exercises and routines are ARCHIVED, never hard-deleted.
- AI features must degrade silently. If AI is broken, logging still works.
- AI IS NEVER A SOURCE OF TRUTH. All numbers are computed in `packages/domain`
  and passed to the model as context. AI writes only to `ai_insights`. BRD §8.4.
- Media NEVER enters the codebase as a URL string. Every asset is a
  `media_assets` row with source, licence and attribution. No licence, no
  render. BRD §6.8. The client resolves a `mediaId` through `/media/:id/url`.
- CORS origins are an exact-match allowlist from env. Never `*` outside
  development. Verify CORS changes IN A BROWSER — native Android does not send
  an Origin header. `apps/api/tests/cors.test.ts` is the regression guard.
- Every request has a correlation ID, logged on every line and echoed in the
  response.
- No Docker, Kubernetes, Redis, Kafka or GraphQL. If you think we need one,
  write an ADR proposal instead of adding it. BRD §3.3.1.
- `/admin/*` requires `users.is_admin`. Non-admins get 404, not 403.
- Never log PII, tokens, emails or raw request bodies.
- Timers reconcile from a stored end timestamp, never from a live counter.
  BRD §13.2.

## Layout

```
apps/api          Fastify + Drizzle. routes/ are thin; services/ hold the logic.
apps/mobile       Expo Router app, Android + web from one codebase.
apps/worker       Claims queued analyses, runs the analyzer, writes results.
packages/shared   Zod schemas and derived types — the API contract.
packages/domain   Pure business logic. No I/O, no framework imports.
services/analyzer Python. Tracks the bar and emits a PATH — nothing more.
content/          exercises.seed.json — the catalogue as reviewable data.
docs/adr/         Architecture decisions.
```

The analyzer emits a bar path; `packages/domain/bar-path.ts` turns it into
metres, reps and velocities. That seam is deliberate — see apps/worker/README.md.
Do not compute a published number in Python.

## Commands

```
pnpm dev:api        Fastify with watch
pnpm dev:mobile     Expo (press 'a' for Android, 'w' for web)
pnpm dev:worker     Analysis worker with watch
pnpm worker:once    Claim one queued analysis, work it, exit
pnpm db:generate    Drizzle migration from the schema diff
pnpm db:migrate     Apply migrations (forward-only)
pnpm db:seed        Load content/exercises.seed.json
pnpm content:export Live catalogue -> content/exercises.seed.json
pnpm content:import Idempotent re-import
pnpm test           All tests (integration suites skip without TEST_DATABASE_URL)
pnpm typecheck
pnpm lint
```

Integration tests need a Postgres: set `TEST_DATABASE_URL` and they run;
otherwise they skip. CI always provides one.

## Workflow

1. State which requirement IDs the task implements.
2. Write or update the Zod schema first.
3. Write the migration if the schema changed.
4. Implement API, then client.
5. Write tests. Run `pnpm typecheck && pnpm lint && pnpm test` before declaring
   done, and paste the output.
6. Keep diffs scoped to one feature. Do not refactor unrelated code.

## Things that will be rejected in review

- Storing weights in pounds, as floats, or per-set derived 1RM (BRD §9.3).
- A media URL anywhere but a `media_assets` row.
- A query without a `user_id` predicate.
- A new "god" component. One component, one level of the tree.
- A migration generated but not read line by line. Drizzle diffs can silently
  drop columns.
