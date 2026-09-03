-- "Not chosen yet" has to be representable.
--
-- 0010 gave the column a NOT NULL default of 'monarch', which was right when
-- an Ascension was a setting buried in the profile. Now the app asks for one at
-- first launch, and it cannot ask without being able to tell "this person chose
-- Monarch" from "this person has never been asked". A default makes those two
-- states identical.
--
-- So the column becomes nullable, NULL meaning unchosen, and every existing row
-- is set back to NULL. That is deliberate rather than a side effect: the
-- feature is days old, so nobody has made a considered choice yet — they were
-- all defaulted into Monarch by 0010. Clearing it means everyone is asked once,
-- which is the intended experience and not a loss of anything.
--
-- Nothing else changes. `ascensionFor(null)` in @fi/domain already falls back to
-- the default, so the app is themed correctly while the question is on screen.

ALTER TABLE "user_profiles" ALTER COLUMN "ascension" DROP DEFAULT;
ALTER TABLE "user_profiles" ALTER COLUMN "ascension" DROP NOT NULL;
UPDATE "user_profiles" SET "ascension" = NULL;
