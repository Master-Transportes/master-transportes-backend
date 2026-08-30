ALTER TABLE "sessions" ADD COLUMN "device_id" varchar(255);
CREATE INDEX "sessions_device_id_idx" ON "sessions" USING btree ("device_id");
