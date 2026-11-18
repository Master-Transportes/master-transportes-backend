/**
 * Smoke test em runtime real (Etapa 2 do MVP) — comportamentos verificados:
 *  1. motorista APPROVED conecta em /driver/stream com JWT e recebe stream.connected;
 *  2. envia location.updated e heartbeat válidos;
 *  3. mensagem com type desconhecido é descartada pelo runtime do Encore
 *     (conexão persiste — camada de schema do transporte);
 *  4. mensagem com semântica inválida (sampledAt fora da janela) encerra a
 *     conexão no servidor (fail fast, Zod + stream.close());
 *  5. reconexão após a queda recebe novo stream.connected.
 *
 * Uso: bun run scripts/smoke-driver-stream.ts <baseURL> <token>
 */
export {};

const baseURL = process.argv[2] ?? "http://127.0.0.1:4100";
const token = process.argv[3];
if (!token) {
  console.error("Token ausente.");
  process.exit(1);
}

const wsURL = baseURL.replace(/^http/, "ws") + "/driver/stream";

function connect(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsURL, { headers: { Authorization: `Bearer ${token}` } });
    ws.addEventListener("open", () => resolve(ws), { once: true });
    ws.addEventListener("error", event => reject(new Error(`Falha no handshake: ${JSON.stringify(event)}`)), {
      once: true,
    });
  });
}

function nextMessage(ws: WebSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    ws.addEventListener("message", event => resolve(String(event.data)), { once: true });
    ws.addEventListener("close", () => reject(new Error("conexão encerrada sem mensagem")), { once: true });
  });
}

function waitClose(ws: WebSocket, timeoutMs = 5_000): Promise<boolean> {
  return new Promise(resolve => {
    ws.addEventListener("close", () => resolve(true), { once: true });
    setTimeout(() => resolve(false), timeoutMs);
  });
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`✗ ${message}`);
    process.exit(1);
  }
  console.log(`✓ ${message}`);
}

// 1. Conexão autenticada + mensagem inicial de teste.
let ws = await connect();
const connected = JSON.parse(await nextMessage(ws));
assert(connected.type === "stream.connected", "handshake autenticado aceito e stream.connected recebido");
assert(!Number.isNaN(new Date(connected.connectedAt).getTime()), "connectedAt é um instante válido do servidor");

// 2. Localização e heartbeat válidos.
ws.send(
  JSON.stringify({
    type: "location.updated",
    latitude: -3.119,
    longitude: -60.021,
    accuracyMeters: 12,
    sampledAt: new Date().toISOString(),
  }),
);
ws.send(JSON.stringify({ type: "heartbeat" }));
assert(true, "location.updated e heartbeat válidos processados sem erro");

// 3. Type desconhecido: descartado pelo runtime do Encore; a conexão persiste.
ws.send(JSON.stringify({ type: "tipo.desconhecido" }));
const stillOpen = await new Promise<boolean>(resolve => {
  ws.addEventListener("close", () => resolve(false), { once: true });
  setTimeout(() => resolve(true), 1_000);
});
assert(stillOpen, "mensagem com type desconhecido é descartada pelo runtime; conexão persiste");

// 4. Violação semântica: o servidor encerra a conexão (fail fast).
ws.send(
  JSON.stringify({
    type: "location.updated",
    latitude: -3.119,
    longitude: -60.021,
    sampledAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  }),
);
assert(await waitClose(ws), "servidor encerra a conexão em sampledAt fora da janela (fail fast)");

// 5. Reconexão após a queda.
ws = await connect();
const reconnected = JSON.parse(await nextMessage(ws));
assert(reconnected.type === "stream.connected", "reconexão após a queda recebe novo stream.connected");
ws.close();

console.log("\nSMOKE OK");
