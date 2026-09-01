# ADR 0004 — The catalogue ships public-domain demonstration media

- **Status:** Accepted
- **Date:** 2026-09-01
- **Supersedes:** ADR 0003 (the v1 catalogue ships without demonstration media)
- **Context:** BRD §6.8, FR-MED-03, FR-MED-07, FR-MED-10, R10

## Decision

`content/exercises.seed.json` now carries **142 media entries across 71 of the
169 exercises** — two frames each, start position and end position. The
remaining 98 exercises keep the FR-MED-07 placeholder.

Source: [`yuhonas/free-exercise-db`](https://github.com/yuhonas/free-exercise-db),
**The Unlicense** — public domain, commercial use explicit.

## Why this reverses ADR 0003

ADR 0003 was not a decision that media is unnecessary. It said we had no library
we could honestly claim a licence for, and that inventing one would be exactly
the R10 failure the provenance system exists to prevent. That reasoning was
correct and still is.

What changed is only the premise: a genuinely public-domain library was found.
So the blocking condition — "we have no such library" — no longer holds, and
options 1 and 3 in ADR 0003 stop being the only choices.

## How the licence was established

Not by reading the README. Via the GitHub licence API, which returned
`"spdx_id": "Unlicense"` for the repository. The Unlicense is a public-domain
dedication with an explicit grant for commercial use, which maps to
`licence: 'public_domain'` — already in `RENDERABLE_LICENCES`.

Every asset row records `sourceUrl`, `sourceName`, `licence`, `licenceUrl` and
attribution text. The Unlicense requires no attribution; we record it anyway,
because provenance that is visible is worth more than provenance that is merely
stored.

## Delivery: `external_embed`, not `r2_copy`

The images are hotlinked from jsDelivr (a CDN, intended for this) rather than
copied into R2. Two reasons:

1. R2 is not configured in any environment yet (NFR-S-04 makes it optional), and
   `r2_copy` assets would resolve to nothing.
2. `external_embed` is already a first-class delivery mode with its own CHECK
   constraint and its own `idx_media_recheck` index for link-rot sweeps.

This is reversible: switching to `r2_copy` later is a re-import with different
`delivery`, not a schema change.

## Matching: exact, not fuzzy

The two catalogues name exercises differently, so entries had to be paired. The
first attempt scored name similarity above a threshold. It produced:

- Barbell Bench Press ← Barbell **Guillotine** Bench Press
- Front Squat ← Barbell Squat
- Pull-Up ← **V-Bar** Pullup

All three are different movements. A similarity score cannot distinguish a
harmless extra word ("Barbell") from a disqualifying one ("Guillotine"), because
both are just one token.

So the rule became **exact token equivalence**, with two principled exemptions:
a word that merely names equipment we already record in a column, and a
three-word set of genuinely empty words (`grip`, `medium`, `gym`). Anything
otherwise unexplained means "not the same movement". Twenty remaining pairs are
listed as a hand-checked alias table in `scripts/import-movement-media.mjs`, so
a wrong one is visible in review rather than buried in a heuristic.

98 exercises therefore keep placeholders. **Showing a leg press on the bench
press page is worse than showing nothing** — a wrong demonstration is a safety
matter, not a cosmetic one.

## What ADR 0003 got right and is retained

- The placeholder path (FR-MED-07) is a real, tested code path, not a fallback
  nobody exercises — it is what 98 exercises still render.
- Written instructions carry the page. The demonstration is an aid, not the
  content.
- No licence, no render. `media-service.ts` re-checks state and licence on every
  `/media/:id/url` call, so a takedown stops the animation on the next load.
