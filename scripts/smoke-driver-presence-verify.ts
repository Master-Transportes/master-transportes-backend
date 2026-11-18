/**
 * Smoke da Etapa 3 (presença + Redis GEO) — parte de verificação.
 *
 * Rodar com `encore exec -- bun run scripts/smoke-driver-presence-verify.ts <userId>`
 * enquanto o motorista estiver conectado enviando GPS via /driver/stream.
 * Confirma no Redis: presença (HGETALL), membro GEO (GEOPOS) e a descoberta
 * por proximidade via DriverPresenceService.findNearbyDrivers.
 */
export {};
const Redis = (await import("ioredis")).default;
const { driverPresenceService } = await import("../src/services/driver-presence.service");

const userId = process.argv[2];
if (!userId) {
  console.error("Uso: bun run scripts/smoke-driver-presence-verify.ts <userId>");
  process.exit(1);
}

const redis = new Redis(process.env.REDIS_STATE_URL ?? "redis://127.0.0.1:6379", { lazyConnect: false });

// O singleton importado do serviço usa lazyConnect; aguarda ficar pronto para
// evitar corrida de primeiro comando neste processo de verificação.
for (let attempt = 0; attempt < 50; attempt++) {
  try {
    if (await driverPresenceService.isPresent("__warmup__")) break;
  } catch {
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

const state = await redis.hgetall(`driver:state:${userId}`);
console.log("STATE:", JSON.stringify(state));
console.log("GEOPOS:", JSON.stringify(await redis.geopos("driver:geo", userId)));
console.log("PRESENTE:", await driverPresenceService.isPresent(userId));
console.log(
  "NEARBY (Manaus, 5km):",
  JSON.stringify(await driverPresenceService.findNearbyDrivers(-60.021, -3.119, 5_000, 10)),
);

redis.disconnect();
