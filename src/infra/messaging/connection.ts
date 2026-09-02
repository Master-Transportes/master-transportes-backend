import { connect, type Channel, type ChannelModel } from "amqplib";
import log from "encore.dev/log";

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";
const CONNECTION_OPTIONS = {
  heartbeat: 30,
  timeout: 30_000,
};

let channel: Channel | null = null;
let connecting: Promise<Channel> | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let reconnectAttempts = 0;
let isReconnecting = false;
const assertedExchanges = new Set<string>();
const assertedQueues = new Set<string>();

function scheduleReconnect(): void {
  if (reconnectTimer || isReconnecting) return;

  isReconnecting = true;
  reconnectAttempts++;
  const delay = Math.min(250 * Math.pow(2, reconnectAttempts - 1), 30_000) * (0.5 + Math.random());

  log.warn(`RabbitMQ reconnecting in ${Math.floor(delay)}ms (attempt ${reconnectAttempts})`, {
    component: "rabbitmq",
  });

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      await getSharedChannel();
      log.info("RabbitMQ reconnected successfully", {
        component: "rabbitmq",
        attempts: reconnectAttempts,
      });
      reconnectAttempts = 0;
    } catch {
      isReconnecting = false;
      scheduleReconnect();
      return;
    }
    isReconnecting = false;
  }, delay);
}

function resetConnectionState(): void {
  channel = null;
  connecting = null;
  assertedExchanges.clear();
  assertedQueues.clear();
}

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
      const conn: ChannelModel = await connect(RABBITMQ_URL, CONNECTION_OPTIONS);
      const ch = await conn.createChannel();

      conn.on("error", err => {
        log.error("RabbitMQ connection error", { error: err, component: "rabbitmq" });
      });

      conn.on("close", () => {
        log.warn("RabbitMQ connection closed", { component: "rabbitmq" });
        resetConnectionState();
        scheduleReconnect();
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
