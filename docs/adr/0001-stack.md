# ADR 0001 — Stack and repository shape

- **Status:** Accepted
- **Date:** 2026-08-31
- **Context:** BRD §8.2, §14.1, Milestone 0

## Decision

A pnpm monorepo with four workspaces:

| Workspace | Purpose |
|---|---|
| `apps/api` | Node 20 + Fastify 5 + TypeScript, Drizzle over Postgres |
| `apps/mobile` | Expo (SDK 57) + Expo Router, targeting Android and web |
| `packages/shared` | Zod schemas and the types derived from them |
| `packages/domain` | Pure business logic, no I/O |

## Why these, specifically

**Fastify over Express.** Schema-first validation is native, the plugin model
gives real encapsulation for the `/admin` namespace, and cold starts are fast —
which matters on a free tier that suspends (R1).

**Drizzle over Prisma.** Migrations are SQL we read and review by hand (BRD
§16.4 requires exactly that), the schema is TypeScript rather than a bespoke
DSL, and there is no query engine binary to ship.

**Zod 4 as the single contract.** `packages/shared` is validated at the API
boundary *and* imported by client forms, so a rule like "RPE moves in 0.5 steps"
exists once. `fastify-type-provider-zod` uses the same schemas to serialise
responses, which means a response that drifts from its contract fails loudly in
tests rather than quietly in production.

**`packages/domain` as pure source.** Every number the product shows — volume,
estimated 1RM, records, streaks, prefill — is computed here and nowhere else.
This is what makes the Phase 4 AI boundary (BRD §8.4) enforceable rather than
aspirational: the model gets numbers as context because there is no other way to
obtain them.

**Fixed-point decimals, not floats.** BRD §9.3 forbids float weights. Rather
than trusting review to catch it, `packages/domain/src/decimal.ts` holds values
as integer hundredths behind a branded type, so a float weight does not
typecheck.

**Expo with React Native Web.** One codebase for the Android app and the
responsive web app, which is the parity requirement in §3.1. Expo Router keeps
route definitions shared between the two.

**tsup for the API build.** The workspace packages ship TypeScript source, so
the deployable artefact is a bundle with `@fi/*` compiled in and `node_modules`
external. `tsc` alone cannot do that across workspace boundaries.

## Deliberately not adopted

Per BRD §3.3.1: no Docker, Kubernetes, Redis, Kafka, Elasticsearch or GraphQL.
Postgres `pg_trgm` handles search for a catalogue of this size; HTTP cache
headers handle the caching we need. Adding any of them requires its own ADR.

## Consequences

- Integration tests need a real Postgres. They skip without `TEST_DATABASE_URL`
  so a contributor without one still gets a green unit run; CI always provides
  one, so they always run before merge.
- The `nodeLinker: hoisted` setting in `pnpm-workspace.yaml` is required by
  Expo's native module resolution and is not a preference.
- Both packages are consumed as source, not as build output. That keeps the
  inner loop fast and means a change to `packages/domain` is immediately visible
  to both consumers with no build step.
