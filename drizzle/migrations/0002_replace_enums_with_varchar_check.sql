ALTER TABLE "drivers" ALTER COLUMN "status" SET DATA TYPE varchar(20);--> statement-breakpoint
ALTER TABLE "drivers" ALTER COLUMN "status" SET DEFAULT 'PENDING';--> statement-breakpoint
ALTER TABLE "rides" ALTER COLUMN "status" SET DATA TYPE varchar(30);--> statement-breakpoint
ALTER TABLE "rides" ALTER COLUMN "status" SET DEFAULT 'DRIVER_ASSIGNED';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE varchar(20);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'CLIENT';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "status" SET DATA TYPE varchar(20);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';--> statement-breakpoint
DROP TYPE "public"."DriverStatus";--> statement-breakpoint
DROP TYPE "public"."RideStatus";--> statement-breakpoint
DROP TYPE "public"."Role";--> statement-breakpoint
DROP TYPE "public"."UserStatus";