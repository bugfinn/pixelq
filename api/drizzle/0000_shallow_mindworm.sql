CREATE TYPE "public"."job_status" AS ENUM('queued', 'processing', 'done', 'failed', 'enqueue_failed');--> statement-breakpoint
CREATE TYPE "public"."variant_name" AS ENUM('thumbnail', 'medium', 'full');--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_name" text NOT NULL,
	"stored_path" text NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "outputs" (
	"job_id" uuid NOT NULL,
	"variant" "variant_name" NOT NULL,
	"path" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	CONSTRAINT "outputs_job_id_variant_pk" PRIMARY KEY("job_id","variant")
);
--> statement-breakpoint
ALTER TABLE "outputs" ADD CONSTRAINT "outputs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;