import "dotenv/config";
import { connect, type Channel, type ChannelModel } from "amqplib";

const EXCHANGE = "ride.exchange";
const ROUTING_KEY = "ride.requested";

let channel: Channel | null = null;

async function ensureChannel(): Promise<Channel> {
  if (channel) return channel;
  const url = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";
  const conn: ChannelModel = await connect(url);
  channel = await conn.createChannel();
  await channel.assertExchange(EXCHANGE, "topic", { durable: true });
  conn.on("close", () => {
    channel = null;
  });
  return channel;
}

export async function publishRideRequested(message: {
  rideId: string;
  passengerId: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  timestamp: string;
}): Promise<boolean> {
  const ch = await ensureChannel();
  const data = Buffer.from(JSON.stringify(message));
  return ch.publish(EXCHANGE, ROUTING_KEY, data, { persistent: true });
}

export async function publishRideCancelled(message: {
  rideId: string;
  passengerId: string;
  timestamp: string;
}): Promise<boolean> {
  const ch = await ensureChannel();
  const data = Buffer.from(JSON.stringify(message));
  return ch.publish(EXCHANGE, "ride.cancelled", data, { persistent: true });
}
