ALTER TABLE "drivers" ADD COLUMN "pix_key" varchar(255);--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "pix_key_type" varchar(10);--> statement-breakpoint
CREATE INDEX "wallet_transactions_wallet_id_created_at_idx" ON "wallet_transactions" USING btree ("wallet_id","created_at" desc);