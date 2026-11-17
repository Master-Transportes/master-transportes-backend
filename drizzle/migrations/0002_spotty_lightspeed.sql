ALTER TABLE "rides" DROP CONSTRAINT "rides_searching_no_driver_check";--> statement-breakpoint
ALTER TABLE "rides" DROP CONSTRAINT "rides_accepted_at_state_check";--> statement-breakpoint
ALTER TABLE "rides" DROP CONSTRAINT "rides_started_at_state_check";--> statement-breakpoint
ALTER TABLE "rides" DROP CONSTRAINT "rides_completed_at_state_check";--> statement-breakpoint
ALTER TABLE "rides" DROP CONSTRAINT "rides_cancelled_at_state_check";--> statement-breakpoint
ALTER TABLE "rides" DROP CONSTRAINT "rides_cancelled_identity_check";--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_searching_state_check" CHECK (status <> 'SEARCHING' OR (
        driver_id IS NULL AND accepted_at IS NULL AND started_at IS NULL
        AND completed_at IS NULL AND cancelled_at IS NULL AND cancelled_by_user_id IS NULL
      ));--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_accepted_state_check" CHECK (status <> 'ACCEPTED' OR (
        driver_id IS NOT NULL AND accepted_at IS NOT NULL AND started_at IS NULL
        AND completed_at IS NULL AND cancelled_at IS NULL AND cancelled_by_user_id IS NULL
      ));--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_in_progress_state_check" CHECK (status <> 'IN_PROGRESS' OR (
        driver_id IS NOT NULL AND accepted_at IS NOT NULL AND started_at IS NOT NULL
        AND completed_at IS NULL AND cancelled_at IS NULL AND cancelled_by_user_id IS NULL
      ));--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_completed_state_check" CHECK (status <> 'COMPLETED' OR (
        driver_id IS NOT NULL AND accepted_at IS NOT NULL AND started_at IS NOT NULL
        AND completed_at IS NOT NULL AND cancelled_at IS NULL AND cancelled_by_user_id IS NULL
      ));--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_cancelled_state_check" CHECK (status <> 'CANCELLED' OR (
        cancelled_at IS NOT NULL AND cancelled_by_user_id IS NOT NULL
        AND completed_at IS NULL
        AND (driver_id IS NULL OR accepted_at IS NOT NULL)
        AND (accepted_at IS NULL OR driver_id IS NOT NULL)
        AND (started_at IS NULL OR (accepted_at IS NOT NULL AND driver_id IS NOT NULL))
      ));--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_cancelled_by_state_check" CHECK (cancelled_by_user_id IS NULL OR status = 'CANCELLED');--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_chronology_check" CHECK ((accepted_at IS NULL OR started_at IS NULL OR started_at >= accepted_at)
        AND (started_at IS NULL OR completed_at IS NULL OR completed_at >= started_at));--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_cancelled_chronology_check" CHECK (cancelled_at IS NULL
        OR ((accepted_at IS NULL OR cancelled_at >= accepted_at)
          AND (started_at IS NULL OR cancelled_at >= started_at)));