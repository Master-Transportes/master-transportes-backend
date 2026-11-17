CREATE TYPE "public"."ride_offer_status" AS ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."ride_status" AS ENUM('SEARCHING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "ride_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ride_id" uuid NOT NULL,
	"driver_user_id" uuid NOT NULL,
	"status" "ride_offer_status" DEFAULT 'PENDING' NOT NULL,
	"offered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ride_offers_window_check" CHECK (expires_at > offered_at),
	CONSTRAINT "ride_offers_response_check" CHECK (((status IN ('ACCEPTED', 'REJECTED')) = (responded_at IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "rides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"passenger_id" uuid NOT NULL,
	"status" "ride_status" DEFAULT 'SEARCHING' NOT NULL,
	"origin_lat" numeric(9, 6) NOT NULL,
	"origin_lng" numeric(9, 6) NOT NULL,
	"origin_address" text NOT NULL,
	"destination_lat" numeric(9, 6) NOT NULL,
	"destination_lng" numeric(9, 6) NOT NULL,
	"destination_address" text NOT NULL,
	"driver_id" uuid,
	"accepted_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_user_id" uuid,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rides_origin_coords_check" CHECK (origin_lat BETWEEN -90 AND 90 AND origin_lng BETWEEN -180 AND 180),
	CONSTRAINT "rides_destination_coords_check" CHECK (destination_lat BETWEEN -90 AND 90 AND destination_lng BETWEEN -180 AND 180),
	CONSTRAINT "rides_origin_address_not_blank" CHECK (length(trim(origin_address)) > 0),
	CONSTRAINT "rides_destination_address_not_blank" CHECK (length(trim(destination_address)) > 0),
	CONSTRAINT "rides_searching_no_driver_check" CHECK (status <> 'SEARCHING' OR driver_id IS NULL),
	CONSTRAINT "rides_driver_requires_accepted_at_check" CHECK (driver_id IS NULL OR accepted_at IS NOT NULL),
	CONSTRAINT "rides_accepted_at_state_check" CHECK (accepted_at IS NULL OR status <> 'SEARCHING'),
	CONSTRAINT "rides_started_at_state_check" CHECK (started_at IS NULL OR status IN ('IN_PROGRESS', 'COMPLETED')),
	CONSTRAINT "rides_completed_at_state_check" CHECK (completed_at IS NULL OR status = 'COMPLETED'),
	CONSTRAINT "rides_cancelled_at_state_check" CHECK (cancelled_at IS NULL OR status = 'CANCELLED'),
	CONSTRAINT "rides_cancelled_identity_check" CHECK (status <> 'CANCELLED' OR (cancelled_at IS NOT NULL AND cancelled_by_user_id IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "ride_offers" ADD CONSTRAINT "ride_offers_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_offers" ADD CONSTRAINT "ride_offers_driver_user_id_driver_profiles_user_id_fk" FOREIGN KEY ("driver_user_id") REFERENCES "public"."driver_profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_passenger_id_users_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_driver_id_driver_profiles_user_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."driver_profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_cancelled_by_user_id_users_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ride_offers_pending_unique" ON "ride_offers" USING btree ("ride_id","driver_user_id") WHERE status = 'PENDING';--> statement-breakpoint
CREATE UNIQUE INDEX "ride_offers_accepted_unique" ON "ride_offers" USING btree ("ride_id") WHERE status = 'ACCEPTED';--> statement-breakpoint
CREATE INDEX "ride_offers_driver_pending_idx" ON "ride_offers" USING btree ("driver_user_id") WHERE status = 'PENDING';--> statement-breakpoint
CREATE INDEX "ride_offers_ride_idx" ON "ride_offers" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "ride_offers_expiry_idx" ON "ride_offers" USING btree ("expires_at") WHERE status = 'PENDING';--> statement-breakpoint
CREATE INDEX "rides_status_created_idx" ON "rides" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "rides_passenger_history_idx" ON "rides" USING btree ("passenger_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rides_driver_active_unique" ON "rides" USING btree ("driver_id") WHERE status IN ('ACCEPTED', 'IN_PROGRESS');