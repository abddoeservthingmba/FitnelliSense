CREATE TYPE "public"."exercise_kind" AS ENUM('strength', 'cardio');--> statement-breakpoint
ALTER TYPE "public"."pr_type" ADD VALUE 'farthest_distance';--> statement-breakpoint
ALTER TYPE "public"."pr_type" ADD VALUE 'longest_duration';--> statement-breakpoint
ALTER TYPE "public"."pr_type" ADD VALUE 'best_pace';--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "kind" "exercise_kind" DEFAULT 'strength' NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD COLUMN "duration_secs" integer;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD COLUMN "distance_m" integer;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_cardio_range" CHECK (("workout_sets"."duration_secs" IS NULL OR "workout_sets"."duration_secs" BETWEEN 0 AND 86400)
      AND ("workout_sets"."distance_m" IS NULL OR "workout_sets"."distance_m" BETWEEN 0 AND 1000000));