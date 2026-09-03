-- "Path" is now "Ascension" — the feature earned a better name.
--
-- A RENAME, hand-written rather than generated. `drizzle-kit generate` cannot
-- tell a rename from a drop-and-add without being asked interactively, and the
-- drop-and-add it would otherwise emit destroys the column's data. CLAUDE.md
-- warns about exactly this; the safe form is one line and there is no reason
-- not to write it.
--
-- Forward-only (NFR-D-03), so 0010 stays as it was even though it added the
-- column under the old name a few hours ago.
--
-- ONE CAVEAT, stated because it is real: for the seconds between the migration
-- running and the new code serving traffic, the running instance is querying a
-- column that no longer exists under that name. On a single free instance with
-- a handful of trial users that is a blip during a deploy nobody is mid-request
-- for. It would NOT be acceptable with real traffic — the pattern there is add
-- the new column, write both, backfill, then drop.

ALTER TABLE "user_profiles" RENAME COLUMN "progression_path" TO "ascension";
