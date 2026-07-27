CREATE TYPE "public"."DriverStatus" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."RideStatus" AS ENUM('DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."Role" AS ENUM('DRIVER', 'CLIENT', 'ADMIN', 'EMPLOYEE');--> statement-breakpoint
CREATE TYPE "public"."UserStatus" AS ENUM('ACTIVE', 'BANNED', 'INACTIVE');--> statement-breakpoint
CREATE TABLE "Area" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"municipality" varchar NOT NULL,
	"abbrevState" varchar NOT NULL,
	"geometry" geometry,
	"cdMun" varchar NOT NULL,
	"cdUf" varchar NOT NULL,
	"nmUf" varchar NOT NULL,
	"cdRegia" varchar NOT NULL,
	"nmRegia" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Driver" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"cnh" varchar(20),
	"cnhCategory" varchar(5),
	"status" "DriverStatus" DEFAULT 'PENDING' NOT NULL,
	"rejectionReason" varchar(255),
	"approvedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "Driver_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "RideLocation" (
	"rideId" uuid PRIMARY KEY NOT NULL,
	"originName" varchar(200) NOT NULL,
	"originLat" double precision NOT NULL,
	"originLng" double precision NOT NULL,
	"originH3" varchar(20) NOT NULL,
	"destinationName" varchar(200) NOT NULL,
	"destinationLat" double precision NOT NULL,
	"destinationLng" double precision NOT NULL,
	"destinationH3" varchar(20) NOT NULL,
	"regionId" varchar(30) DEFAULT 'am-interior' NOT NULL,
	"municipalityId" varchar(20) DEFAULT 'unknown' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Ride" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clientId" uuid NOT NULL,
	"driverId" uuid NOT NULL,
	"status" "RideStatus" DEFAULT 'DRIVER_ASSIGNED' NOT NULL,
	"startedAt" timestamp,
	"completedAt" timestamp,
	"cancelledAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "User" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fullName" varchar(120) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password" varchar NOT NULL,
	"role" "Role" DEFAULT 'CLIENT' NOT NULL,
	"status" "UserStatus" DEFAULT 'ACTIVE' NOT NULL,
	"banReason" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "User_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "Vehicle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driverId" uuid NOT NULL,
	"brand" varchar(50) NOT NULL,
	"model" varchar(80) NOT NULL,
	"year" integer NOT NULL,
	"color" varchar(30) NOT NULL,
	"plate" varchar(10) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "Vehicle_plate_unique" UNIQUE("plate")
);
--> statement-breakpoint
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "RideLocation" ADD CONSTRAINT "RideLocation_rideId_Ride_id_fk" FOREIGN KEY ("rideId") REFERENCES "public"."Ride"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Ride" ADD CONSTRAINT "Ride_clientId_User_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Ride" ADD CONSTRAINT "Ride_driverId_User_id_fk" FOREIGN KEY ("driverId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_driverId_Driver_id_fk" FOREIGN KEY ("driverId") REFERENCES "public"."Driver"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "Area_municipality_idx" ON "Area" USING btree ("municipality");--> statement-breakpoint
CREATE INDEX "Area_abbrevState_idx" ON "Area" USING btree ("abbrevState");--> statement-breakpoint
CREATE INDEX "Area_geometry_idx" ON "Area" USING gist ("geometry");--> statement-breakpoint
CREATE INDEX "Driver_status_idx" ON "Driver" USING btree ("status");--> statement-breakpoint
CREATE INDEX "Driver_userId_idx" ON "Driver" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "RideLocation_regionId_idx" ON "RideLocation" USING btree ("regionId");--> statement-breakpoint
CREATE INDEX "RideLocation_municipalityId_idx" ON "RideLocation" USING btree ("municipalityId");--> statement-breakpoint
CREATE INDEX "Ride_clientId_idx" ON "Ride" USING btree ("clientId");--> statement-breakpoint
CREATE INDEX "Ride_driverId_idx" ON "Ride" USING btree ("driverId");--> statement-breakpoint
CREATE INDEX "Ride_status_idx" ON "Ride" USING btree ("status");--> statement-breakpoint
CREATE INDEX "Ride_createdAt_idx" ON "Ride" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "Ride_client_active_idx" ON "Ride" USING btree ("clientId") WHERE "status" IN ('DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'IN_PROGRESS');--> statement-breakpoint
CREATE INDEX "Ride_driver_active_idx" ON "Ride" USING btree ("driverId") WHERE "status" IN ('DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'IN_PROGRESS');--> statement-breakpoint
CREATE INDEX "User_role_idx" ON "User" USING btree ("role");--> statement-breakpoint
CREATE INDEX "User_createdAt_idx" ON "User" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "Vehicle_driverId_idx" ON "Vehicle" USING btree ("driverId");--> statement-breakpoint
CREATE INDEX "Vehicle_plate_idx" ON "Vehicle" USING btree ("plate");