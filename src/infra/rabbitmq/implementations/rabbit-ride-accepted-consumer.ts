import "dotenv/config";
import { type ConsumeMessage } from "amqplib";
import { z, ZodError } from "zod";
import { latLngToCell } from "h3-js";
import { H3_RESOLUTION } from "@/infra/redis/keys-cache";
import { rideRepository } from "@/infra/drizzle";
import { rideRequestStore } from "@/infra/redis";
import { areaService } from "@/services/area.service";
import { logger } from "@/infra/observability/logger";
import { ensureChannel } from "@/infra/rabbitmq/connection";
import type { CreateRideData } from "@/infra/drizzle/contracts/IRideRepository";

const EXCHANGE = "ride.exchange";
const QUEUE = "api.ride.driver.accepted";
const ROUTING_KEY = "ride.driver.accepted";

const schema = z.object({
  rideId: z.string().uuid(),
  driverId: z.string().uuid(),
  passengerId: z.string().uuid(),
  origin: z.object({
    name: z.string(),
    lat: z.number(),
    lng: z.number(),
  }),
  destination: z.object({
    name: z.string(),
    lat: z.number(),
    lng: z.number(),
  }),
  timestamp: z.string(),
});

async function handleMessage(msg: ConsumeMessage): Promise<void> {
  const event = schema.parse(JSON.parse(msg.content.toString()));

  const existing = await rideRepository.findById(event.rideId);
  if (existing) {
    await rideRequestStore.releaseIfLocked(event.passengerId, event.rideId);
    logger.info("Ride already exists, skipping duplicate", {
      rideId: event.rideId,
      component: "ride-accepted-consumer",
    });
    return;
  }

  const region = await areaService.getRegion({ lat: event.origin.lat, lng: event.origin.lng });
  const originH3 = latLngToCell(event.origin.lat, event.origin.lng, H3_RESOLUTION);
  const destinationH3 = latLngToCell(event.destination.lat, event.destination.lng, H3_RESOLUTION);

  const data: CreateRideData = {
    id: event.rideId,
    clientId: event.passengerId,
    driverId: event.driverId,
    status: "DRIVER_ASSIGNED",
    originName: event.origin.name,
    originLat: event.origin.lat,
    originLng: event.origin.lng,
    originH3,
    destinationName: event.destination.name,
    destinationLat: event.destination.lat,
    destinationLng: event.destination.lng,
    destinationH3,
    regionId: region.regionId,
    municipalityId: region.municipalityId,
  };

  await rideRepository.createRideAndLocation(data);
  await rideRequestStore.releaseIfLocked(event.passengerId, event.rideId);

  logger.info("Ride created from driver.accepted event", { rideId: event.rideId, component: "ride-accepted-consumer" });
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
      logger.error("Failed to process ride.driver.accepted", err, { component: "ride-accepted-consumer" });
      ch.nack(msg, false, !poison);
    }
  });
  logger.info("ride-accepted consumer started", { component: "ride-accepted-consumer" });
}

startConsumer().catch(err => {
  logger.error("Failed to start ride-accepted consumer", err, { component: "ride-accepted-consumer" });
});
