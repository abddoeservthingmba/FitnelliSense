-- Paths (FR-HP-11): which universe the progression is dressed as.
--
-- Presentation only. Every threshold, XP award and rank boundary is identical
-- on every Path, so this column cannot move anything a user has earned — which
-- is why it is safe to default every existing account onto the original ladder
-- and let them change it whenever they like.
--
-- Deliberately NOT a CHECK constraint. `pathFor()` in @fi/domain falls back to
-- the default for any value it does not recognise, so an unknown Path degrades
-- to the original look rather than erroring; a CHECK would mean a migration
-- every time a Path is added, for a field where a bad value is already
-- harmless. Writes are validated by the Zod enum on the way in.

ALTER TABLE "user_profiles" ADD COLUMN "progression_path" text DEFAULT 'monarch' NOT NULL;