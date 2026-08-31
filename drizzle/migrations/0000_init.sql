CREATE TABLE "driver_licenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"cnh" varchar(20) NOT NULL,
	"category" varchar(5) NOT NULL,
	"valid_from" date DEFAULT now() NOT NULL,
	"valid_until" date,
	"is_active" boolean DEFAULT false NOT NULL,
	"is_verified" boolean DEFAULT false,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" varchar(120) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password" varchar NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"rejection_reason" varchar(255),
	"ban_reason" varchar(255),
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "drivers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "ride_locations" (
	"ride_id" uuid PRIMARY KEY NOT NULL,
	"origin_name" varchar(200) NOT NULL,
	"origin_lat" double precision NOT NULL,
	"origin_lng" double precision NOT NULL,
	"origin_h3" varchar(20) NOT NULL,
	"destination_name" varchar(200) NOT NULL,
	"destination_lat" double precision NOT NULL,
	"destination_lng" double precision NOT NULL,
	"destination_h3" varchar(20) NOT NULL,
	"region_id" varchar(30) DEFAULT 'am-interior' NOT NULL,
	"municipality_id" varchar(20) DEFAULT 'unknown' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "rides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"status" varchar(30) DEFAULT 'DRIVER_ASSIGNED' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"cancelled_at" timestamp,
	"price" integer,
	"distance" integer,
	"duration" integer,
	"cancelled_by" varchar(20),
	"cancel_reason" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"user_type" varchar(20) NOT NULL,
	"refresh_token_hash" varchar(64) NOT NULL,
	"device_id" varchar(255),
	"user_agent" varchar(500),
	"ip_address" varchar(45),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" varchar(120) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password" varchar NOT NULL,
	"role" varchar(20) DEFAULT 'CLIENT' NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"ban_reason" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"brand" varchar(50) NOT NULL,
	"model" varchar(80) NOT NULL,
	"year" integer NOT NULL,
	"color" varchar(30) NOT NULL,
	"plate" varchar(10) NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "vehicles_plate_unique" UNIQUE("plate")
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'BRL' NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "driver_licenses" ADD CONSTRAINT "driver_licenses_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_locations" ADD CONSTRAINT "ride_locations_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "driver_licenses_driver_id_idx" ON "driver_licenses" USING btree ("driver_id");--> statement-breakpoint
CREATE UNIQUE INDEX "driver_licenses_active_unique" ON "driver_licenses" USING btree ("driver_id") WHERE "is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "driver_licenses_cnh_unique" ON "driver_licenses" USING btree ("cnh");--> statement-breakpoint
CREATE INDEX "drivers_status_idx" ON "drivers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "drivers_created_at_idx" ON "drivers" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ride_locations_region_id_idx" ON "ride_locations" USING btree ("region_id");--> statement-breakpoint
CREATE INDEX "ride_locations_municipality_id_idx" ON "ride_locations" USING btree ("municipality_id");--> statement-breakpoint
CREATE INDEX "rides_client_id_idx" ON "rides" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "rides_driver_id_idx" ON "rides" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "rides_status_idx" ON "rides" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rides_created_at_idx" ON "rides" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "rides_client_id_status_idx" ON "rides" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "rides_driver_id_status_idx" ON "rides" USING btree ("driver_id","status");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_refresh_token_hash_idx" ON "sessions" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "vehicles_driver_id_idx" ON "vehicles" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "vehicles_plate_idx" ON "vehicles" USING btree ("plate");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_active_unique" ON "vehicles" USING btree ("driver_id") WHERE "is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_user_id_unique" ON "wallets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wallets_status_idx" ON "wallets" USING btree ("status");