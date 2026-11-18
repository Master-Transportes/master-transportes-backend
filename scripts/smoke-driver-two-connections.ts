/**
 * Smoke da correção de propriedade: DUAS conexões WebSocket reais
 * simultâneas do mesmo motorista.
 *
 * Cenário:
 *   1. A conecta, envia GPS.                → state dono = A
 *   2. B conecta (assume, "mais recente vence").
 *   3. A envia heartbeat.                    → superseded ⇒ SERVIDOR ENCERRA A
 *   4. (A morta) A reconnecta e envia GPS.   → reconexão assume de novo ⇒ B é encerrada
 *   5. A (nova) envia GPS final.             → state dono = A-nova
 *   6. Verificação no Redis a cada passo (via DriverPresenceService local).
 *
 * Uso: bun run scripts/smoke-driver-two-connections.ts <baseURL> <token> <userId>
 */
export {};
const Redis = (await import("ioredis")).default;
const { driverPresenceService } = await import("../src/services/driver-presence.service");

const baseURL = process.argv[2] ?? "http://127.0.0.1:4100";
const token = process.argv[3];
const userId = process.argv[4];
if (!token || !userId) {
  console.error("Uso: bun run scripts/smoke-driver-two-connections.ts <baseURL> <token> <userId>");
  process.exit(1);
}

const redis = new Redis(process.env.REDIS_STATE_URL ?? "redis://127.0.0.1:6379", { lazyConnect: false });
const gps = () =>
  JSON.stringify({
    type: "location.updated",
    latitude: -3.119,
    longitude: -60.021,
    accuracyMeters: 12,
    sampledAt: new Date().toISOString(),
  });

function connect(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(baseURL.replace(/^http/, "ws") + "/driver/stream", {
      headers: { Authorization: `Bearer ${token}` },
    });
    ws.addEventListener("open", () => resolve(ws), { once: true });
    ws.addEventListener("error", event => reject(new Error(JSON.stringify(event))), { once: true });
  });
}

async function waitClose(ws: WebSocket, timeoutMs = 5_000): Promise<boolean> {
  return new Promise(resolve => {
    ws.addEventListener("close", () => resolve(true), { once: true });
    setTimeout(() => resolve(false), timeoutMs);
  });
}

const checks: string[] = [];
function assert(condition: boolean, message: string): void {
  checks.push(`${condition ? "✓" : "✗"} ${message}`);
  if (!condition) {
    console.log(checks.join("\n"));
    process.exit(1);
  }
}

// 1. Conexão A: conecta, envia GPS.
const wsA = await connect();
await new Promise(resolve => wsA.addEventListener("message", resolve, { once: true })); // stream.connected
wsA.send(gps());
await new Promise(resolve => setTimeout(resolve, 400));
const stateA = await redis.hgetall(`driver:state:${userId}`);
assert(Object.keys(stateA).length > 0, "1. A conectou, enviou GPS e o estado existe no Redis");

// 2. Conexão B conecta e assume.
const wsB = await connect();
await new Promise(resolve => wsB.addEventListener("message", resolve, { once: true }));
wsB.send(gps());
await new Promise(resolve => setTimeout(resolve, 400));

// 3. A envia heartbeat: superseded ⇒ o SERVIDOR deve encerrar A.
wsA.send(JSON.stringify({ type: "heartbeat" }));
const aClosedByServer = await waitClose(wsA);
assert(aClosedByServer, "3. A enviou heartbeat após B assumir e foi ENCERRADA pelo servidor");

// 4. B continua enviando GPS: estado vivo e pertencente a B.
wsB.send(gps());
await new Promise(resolve => setTimeout(resolve, 400));
const stateB = await redis.hgetall(`driver:state:${userId}`);
assert(Object.keys(stateB).length > 0, "4. B continua com estado válido no Redis");
assert(await driverPresenceService.isPresent(userId), "4b. Presença global confirmada");

// 5. A reconnecta e assume de novo (a mais recente vence) ⇒ B é encerrada
//    NA PRÓXIMA MENSAGEM dela (detecção é orientada a mensagens, sem timer).
const wsA2 = await connect();
await new Promise(resolve => wsA2.addEventListener("message", resolve, { once: true }));
const gpsA2 = gps();
wsA2.send(gpsA2);
await new Promise(resolve => setTimeout(resolve, 400));

wsB.send(gps()); // B tenta GPS após perder a propriedade
const bClosed = await waitClose(wsB);
assert(bClosed, "5. B tentou GPS após A assumir e foi ENCERRADA pelo servidor");

// 6. O GPS da B superseded não sobrescreveu; o estado é o GPS final de A.
const stateFinal = await redis.hgetall(`driver:state:${userId}`);
assert(
  stateFinal.sampledAtMs === String(Date.parse(JSON.parse(gpsA2).sampledAt)),
  "6. O GPS da conexão substituída NÃO sobrescreveu o estado de A",
);

wsA2.send(gps());
await new Promise(resolve => setTimeout(resolve, 400));
const nearby = await driverPresenceService.findNearbyDrivers(-60.021, -3.119, 5_000, 10);
assert(
  nearby.some(candidate => candidate.userId === userId),
  "6b. findNearbyDrivers encontra o motorista",
);

wsA2.close();
redis.disconnect();

console.log(checks.join("\n"));
console.log("\nSMOKE TWO-CONNECTIONS OK");
process.exit(0);
