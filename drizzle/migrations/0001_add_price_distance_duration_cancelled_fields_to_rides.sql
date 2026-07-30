ALTER TABLE "rides" ADD COLUMN "price" integer;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "distance" integer;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "duration" integer;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "cancelled_by" varchar(20);--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "cancel_reason" varchar(255);