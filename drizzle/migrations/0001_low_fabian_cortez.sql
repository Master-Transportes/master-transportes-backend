CREATE TABLE "DriverCredential" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driverId" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"password" varchar NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "DriverCredential_driverId_unique" UNIQUE("driverId"),
	CONSTRAINT "DriverCredential_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "Ride" DROP CONSTRAINT "Ride_driverId_User_id_fk";
--> statement-breakpoint
ALTER TABLE "Driver" ALTER COLUMN "userId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "Driver" ADD COLUMN "fullName" varchar(120) NOT NULL;--> statement-breakpoint
ALTER TABLE "DriverCredential" ADD CONSTRAINT "DriverCredential_driverId_Driver_id_fk" FOREIGN KEY ("driverId") REFERENCES "public"."Driver"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "DriverCredential_email_idx" ON "DriverCredential" USING btree ("email");--> statement-breakpoint
ALTER TABLE "Ride" ADD CONSTRAINT "Ride_driverId_Driver_id_fk" FOREIGN KEY ("driverId") REFERENCES "public"."Driver"("id") ON DELETE no action ON UPDATE no action;