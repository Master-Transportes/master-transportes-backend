import "dotenv/config";
import { connect, type Channel, type ChannelModel, type ConsumeMessage } from "amqplib";
import { z } from "zod";
import { latLngToCell } from "h3-js";
import { H3_RESOLUTION } from "@/infra/cache/keys-cache";
import { rideRepository } from "@/repositories/ride.repository";
import { areaService } from "@/services/area.service";
import { logger } from "@/infra/observability/logger";
import type { CreateRideData } from "@/contracts/IRideRepository";

const EXCHANGE = "ride.exchange";
const QUEUE = "api.ride.driver.accepted";
const ROUTING_KEY = "ride.driver.accepted";

let channel: Channel | null = null;

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

async function ensureChannel(): Promise<Channel> {
  if (channel) return channel;
  const url = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";
  const conn: ChannelModel = await connect(url);
  channel = await conn.createChannel();
  await channel.assertExchange(EXCHANGE, "topic", { durable: true });
  await channel.assertQueue(QUEUE, { durable: true });
  await channel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY);
  conn.on("close", () => { channel = null; });
  return channel;
}

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
  const ch = await ensureChannel();
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
