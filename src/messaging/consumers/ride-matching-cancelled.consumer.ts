import "dotenv/config";
import { type ConsumeMessage } from "amqplib";
import { z, ZodError } from "zod";
import { rideRequestStore } from "@/cache";
import log from "encore.dev/log";
import { ensureChannel } from "@/infra/messaging/connection";

const EXCHANGE = "ride.exchange";
const QUEUE = "api.ride.matching.cancelled";
const ROUTING_KEY = "ride.matching.cancelled";

const schema = z.object({
  rideId: z.string().uuid(),
  passengerId: z.string().uuid(),
  driverId: z.string().uuid().optional(),
  timestamp: z.string(),
});

async function handleMessage(msg: ConsumeMessage): Promise<void> {
  const event = schema.parse(JSON.parse(msg.content.toString()));

  await rideRequestStore.releaseIfLocked(event.passengerId, event.rideId);

  log.info("Ride request lock released (matching cancelled)", {
    rideId: event.rideId,
    passengerId: event.passengerId,
    component: "ride-matching-cancelled-consumer",
  });
}

export async function startConsumer(): Promise<void> {
  const ch = await ensureChannel(EXCHANGE, QUEUE, ROUTING_KEY);
  await ch.prefetch(1);
  await ch.consume(QUEUE, async msg => {
    if (!msg) return;
    try {
      await handleMessage(msg);
      ch.ack(msg);
    } catch (err) {
      const poison = err instanceof ZodError || err instanceof SyntaxError;
      log.error("Failed to process ride.matching.cancelled", {
        error: err,
        component: "ride-matching-cancelled-consumer",
      });
      ch.nack(msg, false, !poison);
    }
  });
  log.info("ride-matching-cancelled consumer started", { component: "ride-matching-cancelled-consumer" });
}

startConsumer().catch(err => {
  log.error("Failed to start ride-matching-cancelled consumer", {
    error: err,
    component: "ride-matching-cancelled-consumer",
  });
});
