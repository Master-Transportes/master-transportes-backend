import "dotenv/config";
import { type ConsumeMessage } from "amqplib";
import { z, ZodError } from "zod";
import { rideRequestStore } from "@/cache";
import log from "encore.dev/log";
import { ensureChannel } from "@/infra/messaging/connection";

const EXCHANGE = "ride.exchange";
const QUEUE = "api.ride.no.drivers";
const ROUTING_KEY = "ride.no.drivers";

const schema = z.object({
  rideId: z.string().uuid(),
  passengerId: z.string().uuid(),
  origin: z.object({
    name: z.string(),
    lat: z.number(),
    lng: z.number(),
  }),
  timestamp: z.string(),
});

async function handleMessage(msg: ConsumeMessage): Promise<void> {
  const event = schema.parse(JSON.parse(msg.content.toString()));

  await rideRequestStore.releaseIfLocked(event.passengerId, event.rideId);

  log.info("Ride request lock released (no drivers)", {
    rideId: event.rideId,
    passengerId: event.passengerId,
    component: "ride-no-drivers-consumer",
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
      log.error("Failed to process ride.no.drivers", { error: err, component: "ride-no-drivers-consumer" });
      ch.nack(msg, false, !poison);
    }
  });
  log.info("ride-no-drivers consumer started", { component: "ride-no-drivers-consumer" });
}

startConsumer().catch(err => {
  log.error("Failed to start ride-no-drivers consumer", { error: err, component: "ride-no-drivers-consumer" });
});
