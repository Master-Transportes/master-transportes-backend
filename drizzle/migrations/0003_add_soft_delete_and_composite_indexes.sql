DROP INDEX "rides_client_active_idx";--> statement-breakpoint
DROP INDEX "rides_driver_active_idx";--> statement-breakpoint
ALTER TABLE "driver_licenses" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "ride_locations" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
CREATE INDEX "rides_client_id_status_idx" ON "rides" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "rides_driver_id_status_idx" ON "rides" USING btree ("driver_id","status");