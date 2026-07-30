import { connect, type Channel, type ChannelModel } from "amqplib";

let channel: Channel | null = null;

export async function ensureChannel(exchange: string, queue?: string, routingKey?: string): Promise<Channel> {
  if (channel) return channel;

  const url = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";
  const conn: ChannelModel = await connect(url);
  channel = await conn.createChannel();

  await channel.assertExchange(exchange, "topic", { durable: true });

  if (queue) {
    await channel.assertQueue(queue, { durable: true });
    if (routingKey) {
      await channel.bindQueue(queue, exchange, routingKey);
    }
  }

  conn.on("close", () => {
    channel = null;
  });

  return channel;
}
