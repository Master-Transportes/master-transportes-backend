ALTER TABLE "wallets" DROP CONSTRAINT "wallets_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "wallets_user_id_unique";--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "owner_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "owner_type" varchar(10) NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_owner_unique" ON "wallets" USING btree ("owner_id","owner_type");--> statement-breakpoint
ALTER TABLE "wallets" DROP COLUMN "user_id";