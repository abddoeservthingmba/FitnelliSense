-- Superseded by `email_codes` (migration 0004).
--
-- This drops data, which is normally a thing to avoid. It is safe here because
-- the table was never populated in any deployed environment: password reset had
-- no email delivery, so no reset token was ever issued to anyone. Any row that
-- did exist would name a reset nobody can complete.
DROP TABLE "password_reset_tokens" CASCADE;
