CREATE TYPE "public"."item_kind" AS ENUM('bottle', 'background');--> statement-breakpoint
CREATE TYPE "public"."reward_status" AS ENUM('pending', 'processing', 'credited', 'failed');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('started', 'verified', 'rejected', 'abandoned');--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"brand" text NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"timezone" text DEFAULT 'Africa/Nairobi' NOT NULL,
	"reward_budget_kes" integer NOT NULL,
	"spent_kes" integer DEFAULT 0 NOT NULL,
	"daily_cap_mb" integer NOT NULL,
	"prizes" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_items" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text,
	"kind" "item_kind" NOT NULL,
	"data" jsonb NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"kind" text NOT NULL,
	"granted" boolean NOT NULL,
	"copy_version" text NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"player_id" uuid,
	"type" text NOT NULL,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leaderboard_windows" (
	"campaign_id" text NOT NULL,
	"period" text NOT NULL,
	"window_key" text NOT NULL,
	"results" jsonb NOT NULL,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leaderboard_windows_campaign_id_period_window_key_pk" PRIMARY KEY("campaign_id","period","window_key")
);
--> statement-breakpoint
CREATE TABLE "mission_progress" (
	"player_id" uuid NOT NULL,
	"mission_id" text NOT NULL,
	"period_key" text NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reward_id" uuid,
	CONSTRAINT "mission_progress_player_id_mission_id_period_key_pk" PRIMARY KEY("player_id","mission_id","period_key")
);
--> statement-breakpoint
CREATE TABLE "missions" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text,
	"data" jsonb NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"ip" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_items" (
	"player_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"source" text NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_items_player_id_item_id_pk" PRIMARY KEY("player_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text,
	"nickname" text,
	"coins" integer DEFAULT 0 NOT NULL,
	"lifetime_flips" integer DEFAULT 0 NOT NULL,
	"best_flips" integer DEFAULT 0 NOT NULL,
	"equipped_bottle_id" text DEFAULT 'classic' NOT NULL,
	"equipped_background_id" text DEFAULT 'night-soda' NOT NULL,
	"sound" boolean DEFAULT true NOT NULL,
	"verified_at" timestamp with time zone,
	"merged_into" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"campaign_id" text,
	"source" text NOT NULL,
	"source_ref" text NOT NULL,
	"reward" jsonb NOT NULL,
	"cost_kes" integer DEFAULT 0 NOT NULL,
	"status" "reward_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"provider_ref" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"credited_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"campaign_id" text,
	"seed" bigint NOT NULL,
	"status" "run_status" DEFAULT 'started' NOT NULL,
	"inputs" jsonb,
	"flips" integer,
	"perfects" integer,
	"max_streak" integer,
	"coins" integer,
	"end_tick" integer,
	"reject_reason" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"refresh_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"code" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"redeemed_by" uuid,
	"redeemed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_windows" ADD CONSTRAINT "leaderboard_windows_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_progress" ADD CONSTRAINT "mission_progress_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_progress" ADD CONSTRAINT "mission_progress_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_items" ADD CONSTRAINT "player_items_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_items" ADD CONSTRAINT "player_items_item_id_catalog_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."catalog_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_redeemed_by_players_id_fk" FOREIGN KEY ("redeemed_by") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_campaign_idx" ON "catalog_items" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "events_type_created_idx" ON "events" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "otp_phone_created_idx" ON "otp_requests" USING btree ("phone","created_at");--> statement-breakpoint
CREATE INDEX "otp_ip_created_idx" ON "otp_requests" USING btree ("ip","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rewards_source_ref_idx" ON "rewards" USING btree ("player_id","source_ref");--> statement-breakpoint
CREATE INDEX "rewards_status_idx" ON "rewards" USING btree ("status");--> statement-breakpoint
CREATE INDEX "runs_player_submitted_idx" ON "runs" USING btree ("player_id","submitted_at");--> statement-breakpoint
CREATE INDEX "runs_leaderboard_idx" ON "runs" USING btree ("status","submitted_at","flips");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_refresh_hash_idx" ON "sessions" USING btree ("refresh_hash");--> statement-breakpoint
CREATE INDEX "sessions_player_idx" ON "sessions" USING btree ("player_id");