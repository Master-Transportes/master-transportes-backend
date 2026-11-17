-- Separação de domínio: ride_requests (solicitação) ≠ rides (corrida confirmada).
-- Preserva o histórico da 0001/0002, migrando os dados existentes e sem deletar
-- solicitações antigas. Se houver duplicidades legadas que violem a nova política,
-- a migration aborta e exige reconciliação manual (não altera dados silenciosamente).

CREATE TYPE "public"."ride_request_status" AS ENUM('SEARCHING', 'ACCEPTED', 'EXPIRED', 'CANCELLED', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."confirmed_ride_status" AS ENUM('ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');--> statement-breakpoint

CREATE TABLE "ride_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"passenger_id" uuid NOT NULL,
	"status" "ride_request_status" DEFAULT 'SEARCHING' NOT NULL,
	"origin_lat" numeric(9, 6) NOT NULL,
	"origin_lng" numeric(9, 6) NOT NULL,
	"origin_address" text NOT NULL,
	"destination_lat" numeric(9, 6) NOT NULL,
	"destination_lng" numeric(9, 6) NOT NULL,
	"destination_address" text NOT NULL,
	"search_expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_user_id" uuid,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ride_requests_origin_coords_check" CHECK (origin_lat BETWEEN -90 AND 90 AND origin_lng BETWEEN -180 AND 180),
	CONSTRAINT "ride_requests_destination_coords_check" CHECK (destination_lat BETWEEN -90 AND 90 AND destination_lng BETWEEN -180 AND 180),
	CONSTRAINT "ride_requests_origin_address_not_blank" CHECK (length(trim(origin_address)) > 0),
	CONSTRAINT "ride_requests_destination_address_not_blank" CHECK (length(trim(destination_address)) > 0),
	CONSTRAINT "ride_requests_search_window_check" CHECK (search_expires_at > created_at),
	CONSTRAINT "ride_requests_searching_state_check" CHECK (status <> 'SEARCHING' OR (
        accepted_at IS NULL AND cancelled_at IS NULL AND cancelled_by_user_id IS NULL
      )),
	CONSTRAINT "ride_requests_accepted_state_check" CHECK (status <> 'ACCEPTED' OR (
        accepted_at IS NOT NULL AND cancelled_at IS NULL AND cancelled_by_user_id IS NULL
      )),
	CONSTRAINT "ride_requests_expired_state_check" CHECK (status <> 'EXPIRED' OR (
        accepted_at IS NULL AND cancelled_at IS NULL AND cancelled_by_user_id IS NULL
      )),
	CONSTRAINT "ride_requests_completed_state_check" CHECK (status <> 'COMPLETED' OR (
        accepted_at IS NOT NULL AND cancelled_at IS NULL AND cancelled_by_user_id IS NULL
      )),
	CONSTRAINT "ride_requests_cancelled_state_check" CHECK (status <> 'CANCELLED' OR (cancelled_at IS NOT NULL AND cancelled_by_user_id IS NOT NULL)),
	CONSTRAINT "ride_requests_cancelled_by_state_check" CHECK (cancelled_by_user_id IS NULL OR status = 'CANCELLED'),
	CONSTRAINT "ride_requests_cancelled_at_state_check" CHECK (cancelled_at IS NULL OR status = 'CANCELLED')
);
--> statement-breakpoint

ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_passenger_id_users_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_cancelled_by_user_id_users_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

-- Falha explicitamente se o banco legado já viola a política de uma única
-- solicitação aberta/corrida ativa por passageiro. Nenhum dado é alterado aqui.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM rides WHERE status = 'SEARCHING'
    GROUP BY passenger_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Migration 0003 abortada: passageiro com mais de uma solicitação SEARCHING legada. Reconcilie manualmente.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM rides WHERE status IN ('ACCEPTED', 'IN_PROGRESS')
    GROUP BY passenger_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Migration 0003 abortada: passageiro com mais de uma corrida ativa legada. Reconcilie manualmente.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM rides r
    WHERE r.status = 'SEARCHING'
      AND EXISTS (
        SELECT 1 FROM rides a
        WHERE a.passenger_id = r.passenger_id
          AND a.status IN ('ACCEPTED', 'IN_PROGRESS')
      )
  ) THEN
    RAISE EXCEPTION 'Migration 0003 abortada: passageiro com solicitação SEARCHING e corrida ativa simultâneas. Reconcilie manualmente.';
  END IF;
END $$;
--> statement-breakpoint

-- Solicitações legadas: SEARCHING vencida vira EXPIRED; confirmadas viram
-- ACCEPTED/COMPLETED/CANCELLED. A solicitação preserva o mesmo id da antiga linha.
INSERT INTO "ride_requests" (
  "id", "passenger_id", "status", "origin_lat", "origin_lng", "origin_address",
  "destination_lat", "destination_lng", "destination_address",
  "search_expires_at", "accepted_at", "cancelled_at", "cancelled_by_user_id",
  "cancellation_reason", "created_at", "updated_at"
)
SELECT
  id,
  passenger_id,
  CASE
    WHEN status = 'SEARCHING' AND created_at + interval '120 seconds' <= now() THEN 'EXPIRED'
    WHEN status = 'SEARCHING' THEN 'SEARCHING'
    WHEN status = 'CANCELLED' THEN 'CANCELLED'
    WHEN status = 'COMPLETED' THEN 'COMPLETED'
    ELSE 'ACCEPTED'
  END::ride_request_status,
  origin_lat, origin_lng, origin_address,
  destination_lat, destination_lng, destination_address,
  CASE
    WHEN status = 'SEARCHING' THEN created_at + interval '120 seconds'
    ELSE GREATEST(COALESCE(accepted_at, created_at), created_at + interval '1 second')
  END,
  accepted_at,
  cancelled_at,
  cancelled_by_user_id,
  cancellation_reason,
  created_at,
  updated_at
FROM rides;
--> statement-breakpoint

CREATE INDEX "ride_requests_passenger_history_idx" ON "ride_requests" USING btree ("passenger_id","created_at");--> statement-breakpoint
CREATE INDEX "ride_requests_status_expires_idx" ON "ride_requests" USING btree ("status","search_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ride_requests_passenger_open_unique" ON "ride_requests" USING btree ("passenger_id") WHERE status IN ('SEARCHING', 'ACCEPTED');--> statement-breakpoint
CREATE UNIQUE INDEX "ride_requests_id_passenger_unique" ON "ride_requests" USING btree ("id","passenger_id");--> statement-breakpoint

-- Ofertas passam a apontar para a solicitação, não para a corrida confirmada.
ALTER TABLE "ride_offers" ADD COLUMN "ride_request_id" uuid;--> statement-breakpoint
UPDATE "ride_offers" SET "ride_request_id" = "ride_id";--> statement-breakpoint
ALTER TABLE "ride_offers" ALTER COLUMN "ride_request_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ride_offers" DROP CONSTRAINT "ride_offers_ride_id_rides_id_fk";--> statement-breakpoint
DROP INDEX "ride_offers_pending_unique";--> statement-breakpoint
DROP INDEX "ride_offers_accepted_unique";--> statement-breakpoint
DROP INDEX "ride_offers_driver_pending_idx";--> statement-breakpoint
DROP INDEX "ride_offers_ride_idx";--> statement-breakpoint
DROP INDEX "ride_offers_expiry_idx";--> statement-breakpoint
ALTER TABLE "ride_offers" DROP COLUMN "ride_id";--> statement-breakpoint
ALTER TABLE "ride_offers" ADD CONSTRAINT "ride_offers_ride_request_id_ride_requests_id_fk" FOREIGN KEY ("ride_request_id") REFERENCES "public"."ride_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ride_offers_pending_unique" ON "ride_offers" USING btree ("ride_request_id","driver_user_id") WHERE status = 'PENDING';--> statement-breakpoint
CREATE UNIQUE INDEX "ride_offers_accepted_unique" ON "ride_offers" USING btree ("ride_request_id") WHERE status = 'ACCEPTED';--> statement-breakpoint
CREATE INDEX "ride_offers_driver_pending_idx" ON "ride_offers" USING btree ("driver_user_id") WHERE status = 'PENDING';--> statement-breakpoint
CREATE INDEX "ride_offers_request_idx" ON "ride_offers" USING btree ("ride_request_id");--> statement-breakpoint
CREATE INDEX "ride_offers_expiry_idx" ON "ride_offers" USING btree ("expires_at") WHERE status = 'PENDING';--> statement-breakpoint

-- Ofertas de solicitações já encerradas não ficam pendentes.
UPDATE "ride_offers"
SET "status" = 'EXPIRED', "responded_at" = NULL, "updated_at" = now()
WHERE "status" = 'PENDING'
  AND "ride_request_id" IN (SELECT "id" FROM "ride_requests" WHERE "status" = 'EXPIRED');
--> statement-breakpoint
UPDATE "ride_offers"
SET "status" = 'CANCELLED', "responded_at" = NULL, "updated_at" = now()
WHERE "status" = 'PENDING'
  AND "ride_request_id" IN (SELECT "id" FROM "ride_requests" WHERE "status" IN ('CANCELLED', 'COMPLETED'));
--> statement-breakpoint

-- Nova tabela de corridas confirmadas. Só recebe linhas com motorista atribuído.
CREATE TABLE "rides_confirmed_new" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ride_request_id" uuid NOT NULL,
	"passenger_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"status" "confirmed_ride_status" DEFAULT 'ACCEPTED' NOT NULL,
	"origin_lat" numeric(9, 6) NOT NULL,
	"origin_lng" numeric(9, 6) NOT NULL,
	"origin_address" text NOT NULL,
	"destination_lat" numeric(9, 6) NOT NULL,
	"destination_lng" numeric(9, 6) NOT NULL,
	"destination_address" text NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_user_id" uuid,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rides_origin_coords_check" CHECK (origin_lat BETWEEN -90 AND 90 AND origin_lng BETWEEN -180 AND 180),
	CONSTRAINT "rides_destination_coords_check" CHECK (destination_lat BETWEEN -90 AND 90 AND destination_lng BETWEEN -180 AND 180),
	CONSTRAINT "rides_origin_address_not_blank" CHECK (length(trim(origin_address)) > 0),
	CONSTRAINT "rides_destination_address_not_blank" CHECK (length(trim(destination_address)) > 0),
	CONSTRAINT "rides_accepted_state_check" CHECK (status <> 'ACCEPTED' OR (
        started_at IS NULL AND completed_at IS NULL
        AND cancelled_at IS NULL AND cancelled_by_user_id IS NULL
      )),
	CONSTRAINT "rides_in_progress_state_check" CHECK (status <> 'IN_PROGRESS' OR (
        started_at IS NOT NULL AND completed_at IS NULL
        AND cancelled_at IS NULL AND cancelled_by_user_id IS NULL
      )),
	CONSTRAINT "rides_completed_state_check" CHECK (status <> 'COMPLETED' OR (
        started_at IS NOT NULL AND completed_at IS NOT NULL
        AND cancelled_at IS NULL AND cancelled_by_user_id IS NULL
      )),
	CONSTRAINT "rides_cancelled_state_check" CHECK (status <> 'CANCELLED' OR (
        cancelled_at IS NOT NULL AND cancelled_by_user_id IS NOT NULL AND completed_at IS NULL
      )),
	CONSTRAINT "rides_cancelled_by_state_check" CHECK (cancelled_by_user_id IS NULL OR status = 'CANCELLED'),
	CONSTRAINT "rides_chronology_check" CHECK ((started_at IS NULL OR started_at >= accepted_at)
        AND (completed_at IS NULL OR (started_at IS NOT NULL AND completed_at >= started_at))),
	CONSTRAINT "rides_cancelled_chronology_check" CHECK (cancelled_at IS NULL
        OR (cancelled_at >= accepted_at
          AND (started_at IS NULL OR cancelled_at >= started_at)))
);
--> statement-breakpoint

ALTER TABLE "rides_confirmed_new" ADD CONSTRAINT "rides_ride_request_id_ride_requests_id_fk" FOREIGN KEY ("ride_request_id") REFERENCES "public"."ride_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides_confirmed_new" ADD CONSTRAINT "rides_passenger_id_users_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides_confirmed_new" ADD CONSTRAINT "rides_driver_id_driver_profiles_user_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."driver_profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides_confirmed_new" ADD CONSTRAINT "rides_cancelled_by_user_id_users_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides_confirmed_new" ADD CONSTRAINT "rides_request_passenger_fk" FOREIGN KEY ("ride_request_id","passenger_id") REFERENCES "public"."ride_requests"("id","passenger_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Copia somente corridas confirmadas; solicitações SEARCHING não geram corrida.
INSERT INTO "rides_confirmed_new" (
  "id", "ride_request_id", "passenger_id", "driver_id", "status",
  "origin_lat", "origin_lng", "origin_address",
  "destination_lat", "destination_lng", "destination_address",
  "accepted_at", "started_at", "completed_at", "cancelled_at",
  "cancelled_by_user_id", "cancellation_reason", "created_at", "updated_at"
)
SELECT
  id, id, passenger_id, driver_id, status::text::confirmed_ride_status,
  origin_lat, origin_lng, origin_address,
  destination_lat, destination_lng, destination_address,
  COALESCE(accepted_at, created_at), started_at, completed_at, cancelled_at,
  cancelled_by_user_id, cancellation_reason,
  COALESCE(accepted_at, created_at), updated_at
FROM rides
WHERE driver_id IS NOT NULL AND status <> 'SEARCHING';
--> statement-breakpoint

DROP TABLE "rides";--> statement-breakpoint
ALTER TABLE "rides_confirmed_new" RENAME TO "rides";--> statement-breakpoint
ALTER TABLE "rides" RENAME CONSTRAINT "rides_confirmed_new_pkey" TO "rides_pkey";--> statement-breakpoint

CREATE UNIQUE INDEX "rides_request_unique" ON "rides" USING btree ("ride_request_id");--> statement-breakpoint
CREATE INDEX "rides_status_created_idx" ON "rides" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "rides_passenger_history_idx" ON "rides" USING btree ("passenger_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rides_driver_active_unique" ON "rides" USING btree ("driver_id") WHERE status IN ('ACCEPTED', 'IN_PROGRESS');--> statement-breakpoint
CREATE UNIQUE INDEX "rides_passenger_active_unique" ON "rides" USING btree ("passenger_id") WHERE status IN ('ACCEPTED', 'IN_PROGRESS');