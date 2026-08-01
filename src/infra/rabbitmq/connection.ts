import { connect, type Channel, type ChannelModel } from "amqplib";

let channel: Channel | null = null;
let connecting: Promise<Channel> | null = null;
const assertedExchanges = new Set<string>();
const assertedQueues = new Set<string>();

export async function ensureChannel(exchange: string, queue?: string, routingKey?: string): Promise<Channel> {
  const ch = await getSharedChannel();

  if (!assertedExchanges.has(exchange)) {
    await ch.assertExchange(exchange, "topic", { durable: true });
    assertedExchanges.add(exchange);
  }

  if (queue && !assertedQueues.has(queue)) {
    await ch.assertQueue(queue, { durable: true });
    if (routingKey) {
      await ch.bindQueue(queue, exchange, routingKey);
    }
    assertedQueues.add(queue);
  }

  return ch;
}

function getSharedChannel(): Promise<Channel> {
  if (channel) return Promise.resolve(channel);

  if (!connecting) {
    connecting = (async () => {
      const url = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";
      const conn: ChannelModel = await connect(url);
      const ch = await conn.createChannel();

      conn.on("close", () => {
        channel = null;
        connecting = null;
        assertedExchanges.clear();
        assertedQueues.clear();
      });

      channel = ch;
      return ch;
    })().catch(err => {
      connecting = null;
      throw err;
    });
  }

  return connecting;
}
