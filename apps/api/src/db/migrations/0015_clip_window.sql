ALTER TABLE "cv_analyses" ADD COLUMN "clip_start_secs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cv_analyses" ADD COLUMN "clip_end_secs" integer DEFAULT 0 NOT NULL;