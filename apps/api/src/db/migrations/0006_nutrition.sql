CREATE TYPE "public"."food_source" AS ENUM('open_food_facts', 'custom');--> statement-breakpoint
CREATE TYPE "public"."meal_slot" AS ENUM('breakfast', 'lunch', 'dinner', 'snack');--> statement-breakpoint
CREATE TABLE "food_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"meal_slot" "meal_slot" NOT NULL,
	"food_id" uuid,
	"food_name" text NOT NULL,
	"brand" text,
	"quantity_g" numeric(8, 2) NOT NULL,
	"energy_kj" integer NOT NULL,
	"protein_g" numeric(5, 2) NOT NULL,
	"carbs_g" numeric(5, 2) NOT NULL,
	"fat_g" numeric(5, 2) NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_entries_quantity_positive" CHECK ("food_entries"."quantity_g" > 0)
);
--> statement-breakpoint
CREATE TABLE "foods" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"barcode" text,
	"source" "food_source" NOT NULL,
	"user_id" uuid,
	"energy_kj" integer NOT NULL,
	"protein_g" numeric(5, 2) NOT NULL,
	"carbs_g" numeric(5, 2) NOT NULL,
	"fat_g" numeric(5, 2) NOT NULL,
	"serving_g" numeric(7, 2),
	"serving_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "foods_source_ownership" CHECK (("foods"."source" = 'custom' AND "foods"."user_id" IS NOT NULL)
       OR ("foods"."source" = 'open_food_facts' AND "foods"."user_id" IS NULL)),
	CONSTRAINT "foods_macros_per_100g" CHECK ("foods"."protein_g" BETWEEN 0 AND 100
      AND "foods"."carbs_g" BETWEEN 0 AND 100
      AND "foods"."fat_g" BETWEEN 0 AND 100
      AND "foods"."energy_kj" BETWEEN 0 AND 4000)
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "target_energy_kj" integer;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "target_protein_g" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "target_carbs_g" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "target_fat_g" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "food_entries" ADD CONSTRAINT "food_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_entries" ADD CONSTRAINT "food_entries_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_food_entries_user_date" ON "food_entries" USING btree ("user_id","entry_date");--> statement-breakpoint
CREATE UNIQUE INDEX "foods_barcode_unique" ON "foods" USING btree ("barcode") WHERE user_id IS NULL AND barcode IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_foods_user" ON "foods" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_foods_name_trgm" ON "foods" USING gin ("name" gin_trgm_ops);