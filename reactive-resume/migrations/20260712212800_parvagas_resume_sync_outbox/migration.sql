CREATE TABLE "parvagas_resume_sync_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"user_id" text NOT NULL,
	"external_user_id" text,
	"resume_id" text NOT NULL,
	"resume_name" text NOT NULL,
	"resume_slug" text NOT NULL,
	"resume_version" integer DEFAULT 1 NOT NULL,
	"resume_updated_at" timestamp with time zone,
	"resume_data" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parvagas_resume_sync_outbox_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "parvagas_resume_sync_outbox" ADD CONSTRAINT "parvagas_resume_sync_outbox_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "parvagas_resume_sync_outbox" ADD CONSTRAINT "parvagas_resume_sync_outbox_resume_id_resume_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resume"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "parvagas_resume_sync_outbox_status_next_attempt_at_idx" ON "parvagas_resume_sync_outbox" USING btree ("status","next_attempt_at");
--> statement-breakpoint
CREATE INDEX "parvagas_resume_sync_outbox_resume_id_created_at_idx" ON "parvagas_resume_sync_outbox" USING btree ("resume_id","created_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "parvagas_resume_sync_outbox_user_id_created_at_idx" ON "parvagas_resume_sync_outbox" USING btree ("user_id","created_at" DESC NULLS LAST);
