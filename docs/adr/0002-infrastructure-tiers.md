# ADR 0002 — Infrastructure tiers and their real limits

- **Status:** Proposed — figures to be confirmed at provisioning
- **Date:** 2026-08-31
- **Context:** BRD NFR-D-09, NFR-B-01, R1, §17 Q13, Q15

## Decision

Run v1 inside free tiers, and record what those tiers actually guarantee rather
than assuming. NFR-D-09 requires the ceilings and current headroom to be in this
file and reviewed at each phase exit.

## To be filled in at provisioning (Milestone 0)

These are open, not decided. Each blocks part of Milestone 0's exit criteria.

| Item | Value | Source | Confirmed |
|---|---|---|---|
| Domain name and Cloudflare zone (Q13) | _pending_ | — | ☐ |
| Neon plan | _pending_ | Neon console | ☐ |
| **Neon PITR retention on that plan (NFR-B-01)** | _pending_ | Neon console | ☐ |
| Neon storage ceiling / current usage | _pending_ | Neon console | ☐ |
| Neon compute-hour ceiling / current usage | _pending_ | Neon console | ☐ |
| Neon idle-suspend delay | _pending_ | Neon console | ☐ |
| R2 storage and Class A/B operation ceilings | _pending_ | Cloudflare | ☐ |
| Render instance-hour ceiling; cold-start behaviour | _pending_ | Render | ☐ |
| EAS build credits per month | _pending_ | Expo | ☐ |
| Minimum Android API level and test devices (Q17) | _pending_ | — | ☐ |

**A pending row is not a detail.** NFR-B-01 exists because "we have PITR" is
worthless without knowing the window, and NFR-B-04's stated RPO of ≤24 h depends
on the `pg_dump`-to-R2 job rather than on the provider's retention.

## What the code already assumes

These assumptions are in the codebase now, and each is a decision this ADR owns:

- **Neon suspends idle compute.** The client is optimistic and cache-first, and
  shows cached data rather than a spinner (NFR-R-06). A connection failure is
  surfaced as `SERVICE_UNAVAILABLE`, which the client treats identically to
  offline (NFR-B-08) rather than as an error.
- **R2 may be absent entirely.** `createStorage` returns a disabled adapter when
  the R2 variables are blank, and media resolution then returns null so the UI
  shows its deterministic placeholder (FR-MED-07, NFR-B-06). Local development
  needs no bucket.
- **The database is portable.** Drizzle over plain Postgres, no Neon-specific
  driver or extension beyond `citext` and `pg_trgm`, both standard. Moving to a
  paid or self-hosted Postgres is a connection-string change (R1's mitigation).
- **Connection pooling is conservative.** `DATABASE_POOL_MAX` defaults to 10
  with a 20-second idle timeout, shorter than the pooler's own, so we close
  connections before it does.

## Consequences

- Until the table above is filled in, the honest statement of our recovery
  position is NFR-B-04's: RPO ≤ 24 h, RTO ≤ 4 h, single-operator manual
  recovery. That is a hobby-tier target and is written down so it is not
  mistaken for more.
- The weekly `pg_dump` to R2 (NFR-B-02) is what makes RPO independent of the
  provider's plan. It is a Phase 3 task and a Phase 3 exit criterion, and the
  restore must be rehearsed at least once (NFR-B-03).
