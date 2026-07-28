CREATE TABLE "DriverLicense" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driverId" uuid NOT NULL,
	"cnh" varchar(20) NOT NULL,
	"category" varchar(5) NOT NULL,
	"validFrom" date DEFAULT now() NOT NULL,
	"validUntil" date,
	"isActive" boolean DEFAULT false NOT NULL,
	"isVerified" boolean DEFAULT false,
	"verifiedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Vehicle" ADD COLUMN "isActive" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "DriverLicense" ADD CONSTRAINT "DriverLicense_driverId_Driver_id_fk" FOREIGN KEY ("driverId") REFERENCES "public"."Driver"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "DriverLicense_driverId_idx" ON "DriverLicense" USING btree ("driverId");--> statement-breakpoint
CREATE UNIQUE INDEX "DriverLicense_active_unique" ON "DriverLicense" USING btree ("driverId") WHERE "isActive" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "Vehicle_active_unique" ON "Vehicle" USING btree ("driverId") WHERE "isActive" = true;--> statement-breakpoint
ALTER TABLE "Driver" DROP COLUMN "cnh";--> statement-breakpoint
ALTER TABLE "Driver" DROP COLUMN "cnhCategory";