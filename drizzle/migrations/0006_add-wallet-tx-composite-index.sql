CREATE INDEX "wallet_transactions_wallet_id_created_at_idx" ON "wallet_transactions" USING btree ("wallet_id","created_at" DESC);
