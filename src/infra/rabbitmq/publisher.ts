import "dotenv/config";
import { connect, type Channel, type ChannelModel } from "amqplib";

const EXCHANGE = "ws.gateway";
const ROUTING_KEY = "ws.gateway.user";

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

export async function publishToUser(userId: string, payload: Record<string, unknown>): Promise<boolean> {
  const ch = await ensureChannel();
  const message = Buffer.from(JSON.stringify({ userId, payload }));
  return ch.publish(EXCHANGE, ROUTING_KEY, message, { persistent: true });
}
