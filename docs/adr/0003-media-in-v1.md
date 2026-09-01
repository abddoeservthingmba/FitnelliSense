# ADR 0003 — The v1 catalogue ships without demonstration media

- **Status:** Superseded by [ADR 0004](0004-catalogue-ships-public-domain-media.md) (2026-09-01)
- **Date:** 2026-08-31
- **Context:** BRD §6.8, FR-MED-07, FR-MED-10, R10

> **Superseded, not reversed.** The reasoning below — that an invented licence
> field is the R10 failure itself — still stands. Only its premise changed: a
> genuinely public-domain library was found, so "we have no such library" is no
> longer true. ADR 0004 records what replaced this and why.

## Decision

`content/exercises.seed.json` ships **169 exercises with no media assets at
all**. Every exercise carries written instructions instead, and the media slot
renders the deterministic placeholder required by FR-MED-07.

## Why

FR-MED-10 requires seeded media to be `original_work`, public domain or CC, with
provenance recorded per asset. We have no such library. The alternatives were:

1. **Ship media with an invented or optimistic licence field.** This is the
   exact failure R10 describes, and it would put a false claim in a database
   column that the whole provenance system is built to trust.
2. **Ship media that is genuinely licensed.** Correct, but it is a content
   procurement task, not a coding task, and it would block the golden path.
3. **Ship no media.** The placeholder path is already a requirement
   (FR-MED-07), the instructions carry the page, and nothing false is recorded.

Option 3 is the only one that is both honest and shippable now.

## What this does not mean

The media system is fully built and tested, not deferred:

- `media_assets` exists with all four CHECK constraints, so an unlicensed asset
  is structurally incapable of being `active`.
- `/media/:id/url` is the only path to a renderable URL, and it re-checks state
  and licence on every request — which is what makes FR-MED-08's takedown take
  effect within one request cycle.
- The admin routes for registering, verifying and taking down assets are
  implemented and audited.
- `seedMediaSchema` in `packages/shared` excludes `unknown` from the licence
  enum, so a seed file with unstated provenance fails to parse. The test
  `apps/api/tests/seed-catalogue.test.ts` asserts this.
- The client's `ExerciseThumbnail` and `ExerciseHero` treat missing, broken,
  taken-down and unlicensed identically: placeholder, never an empty frame.

So adding media later is a content task against a working system, and the
placeholder path stays exercised in the meantime rather than being an untested
fallback discovered during an incident.

## Consequences

- The exercise detail page is text-first. The seed test therefore enforces a
  minimum instruction length, because with no illustration the words are the
  product.
- §19.1's "every rendered media asset has verified provenance and visible
  attribution" is vacuously satisfied in v1, and the takedown criterion should be
  demonstrated against a deliberately seeded test asset before release rather
  than left unproven.
- Revisit when a licensed library is sourced. That does not need a new ADR — the
  system is designed for it — but the licence reference must be recorded before
  merge, per FR-MED-10.
