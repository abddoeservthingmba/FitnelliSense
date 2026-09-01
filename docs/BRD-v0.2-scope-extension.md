# BRD v0.2 — Scope Extension

- **Status:** Accepted
- **Date:** 2026-09-01
- **Extends:** FIP-BRD-001 v0.1 (frozen). Does not amend it.
- **Supersedes:** BRD §3.3 for three bullets only, listed below.

## Why this document exists

BRD v0.1 §3.3 puts three things **explicitly out of scope**:

- Social features: following, sharing, feeds, comments, **leaderboards**
- **Nutrition, calorie, or macro tracking**
- (and §3.3.1 excludes social features as "not the product thesis")

The product owner has since asked for all three, plus daily progression
mechanics. Building them without saying so would leave the codebase and its
stated contract disagreeing, and `CLAUDE.md` makes requirement IDs the contract.
So this document moves those bullets out of §3.3, gives the new surface real
requirement IDs, and records what the original exclusions were protecting
against — because those reasons did not stop being true.

Everything in BRD v0.1 that is **not** named here still holds unchanged. In
particular §9.3 (weights in kilograms as decimals, never floats), §6.8 (media
provenance), NFR-S-03 (every query scoped by `user_id`) and §8.4 (AI is never a
source of truth) apply to all of it.

## What moves into scope

| v0.1 §3.3 bullet | New status | Requirement IDs |
|---|---|---|
| Leaderboards | In scope, opt-in only | FR-LB-01..07 |
| Nutrition, calorie, or macro tracking | In scope | FR-NUT-01..14 |
| (new — no v0.1 equivalent) Daily progression, levels, quests, badges | In scope | FR-HS-01..12 |

Still out of scope, unchanged: following, sharing, feeds, comments, iOS
submission, wearables, payments, coach accounts, live CV.

---

## 1. The Hunter System (FR-HS-*)

Daily progression mechanics: experience, levels, ranks, quests, badges.

| ID | Requirement | Priority |
|---|---|---|
| FR-HS-01 | XP is an append-only ledger (`xp_events`); a user's total is the sum, never a stored counter | M |
| FR-HS-02 | Every XP award is idempotent on `(user_id, source, reference_id)` | M |
| FR-HS-03 | Level is a pure function of total XP; rank is a pure function of level | M |
| FR-HS-04 | XP is itemised — the user is always told what each point was for | M |
| FR-HS-05 | Three daily quests, generated deterministically from `(user_id, date)` so they are stable within a day | M |
| FR-HS-06 | Quest targets scale to the user's own history, not to a fixed number | S |
| FR-HS-07 | A quest pays out once; claiming twice is a conflict, not a second payment | M |
| FR-HS-08 | An unfinished quest cannot be claimed | M |
| FR-HS-09 | Badges are awarded once and never revoked | M |
| FR-HS-10 | Stats (strength, endurance, discipline) are derived from logged work, never from XP | M |
| FR-HS-11 | Every stat states what it is derived from; no number on screen is unexplained | S |
| FR-HS-12 | The Hunter System is decoration over real data. If it fails, logging still works | M |

**FR-HS-10 and FR-HS-12 are the load-bearing ones.** A gamification layer that
invents numbers is a lying fitness tracker, and one that can break set logging
has inverted the product's priorities.

## 2. Leaderboard (FR-LB-*)

| ID | Requirement | Priority |
|---|---|---|
| FR-LB-01 | Appearing on the leaderboard requires explicit opt-in, off by default | M |
| FR-LB-02 | Opting out removes the user from every other user's view immediately | M |
| FR-LB-03 | A non-participant can still read the board, and is told they are not on it | S |
| FR-LB-04 | Published fields are exactly: display name, level, rank, XP, volume, activity count | M |
| FR-LB-05 | No email, bodyweight, measurement, photo or per-exercise figure is ever published | M |
| FR-LB-06 | Windows: week, month, all-time | S |
| FR-LB-07 | Activity within a window is reported as a count, not as a streak — a streak cannot be computed in another user's timezone | M |

**Why FR-LB-01 and FR-LB-05 exist.** Workout data is health-adjacent (v0.1 R2).
Publishing it is a disclosure the user has to choose, and the published field
list is a closed allowlist so that adding a column to `user_profiles` can never
silently widen it.

## 3. Nutrition (FR-NUT-*)

| ID | Requirement | Priority |
|---|---|---|
| FR-NUT-01 | User can log a food entry for a date with a quantity and a meal slot | M |
| FR-NUT-02 | Entries are stored per gram with fixed-point macros; never floats | M |
| FR-NUT-03 | A logged entry keeps its own copy of the nutrition figures it was logged with | M |
| FR-NUT-04 | User can search a food catalogue by name | M |
| FR-NUT-05 | User can look up a food by barcode | S |
| FR-NUT-06 | Barcode and search lookups are proxied by our API, never called from the client | M |
| FR-NUT-07 | External food data is cached locally on first use, with its source recorded | M |
| FR-NUT-08 | User can create a custom food, private to them | S |
| FR-NUT-09 | Daily totals (energy, protein, carbohydrate, fat) are computed in `packages/domain` | M |
| FR-NUT-10 | Targets are derived from the profile the user already gave us, and every one is overrideable | S |
| FR-NUT-11 | No target is presented as medical advice, and none is required to use logging | M |
| FR-NUT-12 | Entries are editable and deletable; a deleted entry is gone, not archived | M |
| FR-NUT-13 | Food logging awards XP through the same ledger as training (FR-HS-01, FR-HS-02) | S |
| FR-NUT-14 | Nutrition data is included in the user's data export and account deletion | M |

### Why FR-NUT-03 exists

A food's figures change — Open Food Facts is crowd-edited, and a product's
recipe changes. If an entry pointed only at a catalogue row, editing that row
would silently rewrite history, and yesterday's total would not match what the
user saw yesterday. So an entry copies the numbers it was logged with. This is
the same reasoning as v0.1 §9.3's rule that a workout set stores its own weight
rather than deriving it.

### Why FR-NUT-11 exists, and what this product will not do

Calorie targets sit next to eating-disorder territory. The line taken here:

- targets are **derived and overrideable**, never prescribed;
- nothing is gated behind hitting a target, and being under or over one is not
  scored, penalised, or streak-breaking;
- there is no weight-loss goal, no deficit recommendation, and no projection;
- FR-NUT-13 awards XP for *logging*, never for hitting a number — otherwise the
  gamification layer would be paying people to under-eat.

**This is a food diary with arithmetic, not a diet.** Anything that would make
it advice belongs behind a qualified reviewer, not behind a commit.

## 4. Risks this extension adds

| ID | Risk | Mitigation |
|---|---|---|
| R12 | Nutrition data is health data in more jurisdictions than workout data | Same `user_id` scoping and export/delete guarantees; no third-party analytics (§3.3.1) |
| R13 | Calorie targets can cause harm if read as prescription | FR-NUT-11; no scoring against targets |
| R14 | Leaderboard publishes health-adjacent data | FR-LB-01, FR-LB-05 |
| R15 | Open Food Facts data quality is uneven and crowd-edited | FR-NUT-03 snapshots figures; FR-NUT-07 records the source; user can always create a custom food |
| R16 | Gamification could distort training toward whatever earns XP | FR-HS-10 derives stats from real work; quest targets scale to the user's own history rather than pushing volume |

## 5. What did not change

- No new infrastructure. §3.3.1 stands: no Redis, no queue, no Docker. The food
  cache is a Postgres table.
- Open Food Facts is a data source, not a dependency the app needs to function:
  search and barcode degrade to "not found", and custom foods still work.
- AI still writes only to `ai_insights` (§8.4). Nothing in this extension lets a
  model compute a number the user sees.
