import "dotenv/config";
import { type ConsumeMessage } from "amqplib";
import { z } from "zod";
import { latLngToCell } from "h3-js";
import { H3_RESOLUTION } from "@/infra/redis/keys-cache";
import { rideRepository } from "@/infra/drizzle";
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
  pickupLat: z.number(),
  pickupLng: z.number(),
  dropoffLat: z.number(),
  dropoffLng: z.number(),
  originName: z.string(),
  destinationName: z.string(),
  timestamp: z.string(),
});

async function handleMessage(msg: ConsumeMessage): Promise<void> {
  const event = schema.parse(JSON.parse(msg.content.toString()));

  const existing = await rideRepository.findById(event.rideId);
  if (existing) {
    logger.info("Ride already exists, skipping duplicate", { rideId: event.rideId, component: "ride-accepted-consumer" });
    return;
  }

  const region = await areaService.getRegion({ lat: event.pickupLat, lng: event.pickupLng });
  const originH3 = latLngToCell(event.pickupLat, event.pickupLng, H3_RESOLUTION);
  const destinationH3 = latLngToCell(event.dropoffLat, event.dropoffLng, H3_RESOLUTION);

  const data: CreateRideData = {
    id: event.rideId,
    clientId: event.passengerId,
    driverId: event.driverId,
    status: "DRIVER_ASSIGNED",
    originName: event.originName,
    originLat: event.pickupLat,
    originLng: event.pickupLng,
    originH3,
    destinationName: event.destinationName,
    destinationLat: event.dropoffLat,
    destinationLng: event.dropoffLng,
    destinationH3,
    regionId: region.regionId,
    municipalityId: region.municipalityId,
  };

  await rideRepository.createRideAndLocation(data);

  logger.info("Ride created from driver.accepted event", { rideId: event.rideId, component: "ride-accepted-consumer" });
}

export async function startConsumer(): Promise<void> {
  const ch = await ensureChannel(EXCHANGE, QUEUE, ROUTING_KEY);
  await ch.prefetch(1);
  await ch.consume(QUEUE, async (msg) => {
    if (!msg) return;
    try {
      await handleMessage(msg);
      ch.ack(msg);
    } catch (err) {
      logger.error("Failed to process ride.driver.accepted", err, { component: "ride-accepted-consumer" });
      ch.nack(msg, false, true);
    }
  });
  logger.info("ride-accepted consumer started", { component: "ride-accepted-consumer" });
}

startConsumer().catch(err => {
  logger.error("Failed to start ride-accepted consumer", err, { component: "ride-accepted-consumer" });
});
