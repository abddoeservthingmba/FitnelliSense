ALTER TABLE "user_profiles" ALTER COLUMN "default_rest_secs" SET DEFAULT 120;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "training_days_per_week" smallint;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "session_minutes" smallint;