-- Athlete profiles publish more than the leaderboard opt-in promised.
--
-- The consent text people accepted said, in as many words, that joining "does
-- not publish your individual lifts". Athlete profiles (FR-LB-08) publish
-- personal records and a muscle-group breakdown. That is more than was agreed,
-- and nobody currently opted in agreed to it.
--
-- Consent given for one thing does not carry over to a bigger thing, so the
-- opt-in is reset and everyone is asked again under the new text. The cost is
-- that current participants have to re-join; the alternative is publishing
-- someone's records under a promise that we would not.
--
-- This is deliberately a data change with no schema change. Forward-only, and
-- re-running it would only re-ask, which is harmless.

UPDATE user_profiles
SET leaderboard_opt_in = false
WHERE leaderboard_opt_in = true;
