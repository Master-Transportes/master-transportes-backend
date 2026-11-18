import { describe, expect, it, afterAll, beforeAll, beforeEach } from "bun:test";
import Redis from "ioredis";
import { DriverPresenceService, type RecordLocationResult } from "@/services/driver-presence.service";

/**
 * Testes de integração com Redis REAL (Etapa 3).
 *
 * Só executam com TEST_REDIS_URL definida — e ela DEVE apontar para um banco
 * Redis descartável (ex.: redis://127.0.0.1:6379/15). A suíte recusa URLs sem
 * índice de banco para não zerar dados de desenvolvimento/produção.
 *
 * Execução: TEST_REDIS_URL=... bun test src/services/__tests__/driver-presence.integration.spec.ts
 */
const testRedisUrl = process.env.TEST_REDIS_URL;

const PRESENCE_TTL_MS = 600; // curto: testes sem esperar segundos reais
const LOCATION_MAX_AGE_MS = 350;
const MAX_ACCURACY_M = 200;
const FUTURE_TOLERANCE_MS = 10_000; // mesma constante única do Zod/serviço

// Manaus: A e B separados por ~2,2 km.
const DRIVER_A = { lat: -3.119, lng: -60.021 };
const DRIVER_B = { lat: -3.1, lng: -60.03 };

function urlHasDatabase(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname.length > 1;
  } catch {
    return false;
  }
}

describe.skipIf(!testRedisUrl)("DriverPresenceService — integração Redis real", () => {
  let redis: Redis;
  let presence: DriverPresenceService;
  let seq = 0;

  const stateKey = (userId: string): string => `driver:state:${userId}`;
  const userId = (prefix: string): string => `${prefix}-${++seq}-${Date.now()}`;

  async function sendGps(
    id: string,
    connectionId: string,
    position: { lat: number; lng: number },
    sampledAtMs: number,
    accuracyMeters = 10,
  ): Promise<RecordLocationResult> {
    return presence.recordLocation(id, connectionId, {
      latitude: position.lat,
      longitude: position.lng,
      sampledAtMs,
      accuracyMeters,
    });
  }

  function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  beforeAll(async () => {
    if (!testRedisUrl) throw new Error("TEST_REDIS_URL ausente");
    if (!urlHasDatabase(testRedisUrl)) {
      throw new Error(
        "TEST_REDIS_URL deve incluir um índice de banco descartável (ex.: redis://127.0.0.1:6379/15) " +
          "para não apontar acidentalmente para dados reais.",
      );
    }
    process.env.REDIS_STATE_URL = testRedisUrl;
    redis = new Redis(testRedisUrl, { lazyConnect: false, maxRetriesPerRequest: 2, connectTimeout: 5_000 });
    presence = new DriverPresenceService(redis, {
      presenceTtlMs: PRESENCE_TTL_MS,
      locationMaxAgeMs: LOCATION_MAX_AGE_MS,
      maxAccuracyMeters: MAX_ACCURACY_M,
      futureToleranceMs: FUTURE_TOLERANCE_MS,
    });
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  afterAll(async () => {
    await redis.flushdb();
    await redis.quit();
  });

  it("1+2: dois motoristas em coordenadas diferentes aparecem na busca ampla, ordenados por proximidade", async () => {
    const a = userId("driver-a");
    const b = userId("driver-b");
    await presence.claimConnection(a, "conn-a");
    await presence.claimConnection(b, "conn-b");
    expect(await sendGps(a, "conn-a", DRIVER_A, Date.now())).toBe("accepted");
    expect(await sendGps(b, "conn-b", DRIVER_B, Date.now())).toBe("accepted");

    const nearby = await presence.findNearbyDrivers(DRIVER_A.lng, DRIVER_A.lat, 5_000, 10);

    expect(nearby.map(candidate => candidate.userId)).toEqual([a, b]);
    expect(nearby[0].distanceMeters).toBeLessThan(nearby[1].distanceMeters);
  });

  it("2: raio menor retorna apenas o motorista mais próximo", async () => {
    const a = userId("driver-a");
    const b = userId("driver-b");
    await presence.claimConnection(a, "conn-a");
    await presence.claimConnection(b, "conn-b");
    await sendGps(a, "conn-a", DRIVER_A, Date.now());
    await sendGps(b, "conn-b", DRIVER_B, Date.now());

    const nearby = await presence.findNearbyDrivers(DRIVER_A.lng, DRIVER_A.lat, 1_000, 10);

    expect(nearby.map(candidate => candidate.userId)).toEqual([a]);
  });

  it("3+4: GPS parado com heartbeat vivo deixa de ser elegível; presença continua", async () => {
    const a = userId("driver-a");
    await presence.claimConnection(a, "conn-a");
    await sendGps(a, "conn-a", DRIVER_A, Date.now());

    // Motorista para de enviar GPS, mas continua com heartbeat: presença é
    // renovada; a localização envelhece além da janela e é filtrada.
    await sleep(LOCATION_MAX_AGE_MS + 150);
    expect(await presence.recordActivity(a, "conn-a")).toBe("renewed");

    expect(await presence.isPresent(a)).toBe(true);
    const nearby = await presence.findNearbyDrivers(DRIVER_A.lng, DRIVER_A.lat, 5_000, 10);
    expect(nearby.map(candidate => candidate.userId)).not.toContain(a);
  });

  it("5: motorista sem atividade perde presença por TTL e é removido do índice GEO", async () => {
    const b = userId("driver-b");
    await presence.claimConnection(b, "conn-b");
    await sendGps(b, "conn-b", DRIVER_B, Date.now());
    expect(await presence.isPresent(b)).toBe(true);

    await sleep(PRESENCE_TTL_MS + 250);

    expect(await presence.isPresent(b)).toBe(false);
    // Limpeza oportunista na leitura: membro órfão sai do índice GEO.
    expect(await presence.findNearbyDrivers(DRIVER_B.lng, DRIVER_B.lat, 5_000, 10)).toEqual([]);
    expect(await redis.zscore("driver:geo", b)).toBeNull();
  });

  it("5b: heartbeat NÃO recria o estado expirado (conexão antiga não recupera a propriedade)", async () => {
    const a = userId("driver-a");
    await presence.claimConnection(a, "conn-a");
    await sleep(PRESENCE_TTL_MS + 250);

    // Estado expirado: heartbeat devolve 'absent' e NÃO cria estado.
    expect(await presence.recordActivity(a, "conn-a")).toBe("absent");
    expect(await presence.isPresent(a)).toBe(false);

    // A recuperação é controlada: reconexão (novo claim) devolve a presença.
    await presence.claimConnection(a, "conn-nova");
    expect(await presence.isPresent(a)).toBe(true);
  });

  it("5c: GPS NÃO recria o estado expirado (sem re-claim implícito por GPS)", async () => {
    const a = userId("driver-a");
    await presence.claimConnection(a, "conn-a");
    await sleep(PRESENCE_TTL_MS + 250);

    expect(
      await presence.recordLocation(a, "conn-a", {
        latitude: DRIVER_A.lat,
        longitude: DRIVER_A.lng,
        sampledAtMs: Date.now(),
      }),
    ).toBe("absent");
    expect(await presence.isPresent(a)).toBe(false);
  });

  it("6+7: reconexão recupera presença e a limpeza da conexão antiga não afeta a nova", async () => {
    const b = userId("driver-b");
    const t1 = Date.now();
    await presence.claimConnection(b, "conn-antiga");
    await sendGps(b, "conn-antiga", DRIVER_B, t1);

    // Nova conexão assume (a mais recente vence).
    await presence.claimConnection(b, "conn-nova");
    await sendGps(b, "conn-nova", DRIVER_B, Date.now());

    // Heartbeat, GPS (até com sampledAt futuro) e limpeza da conexão ANTIGA
    // não alteram o estado da nova: a checagem de dono precede as demais.
    expect(await presence.recordActivity(b, "conn-antiga")).toBe("superseded");
    expect(
      await presence.recordLocation(b, "conn-antiga", {
        latitude: DRIVER_A.lat,
        longitude: DRIVER_A.lng,
        sampledAtMs: Date.now() + 5_000,
      }),
    ).toBe("superseded");
    expect(await presence.releaseConnection(b, "conn-antiga")).toBe("not-owner");
    expect(await presence.isPresent(b)).toBe(true);

    const nearby = await presence.findNearbyDrivers(DRIVER_B.lng, DRIVER_B.lat, 5_000, 10);
    expect(nearby.map(candidate => candidate.userId)).toEqual([b]);
  });

  it("8: amostra antiga não sobrescreve a posição nova", async () => {
    const a = userId("driver-a");
    await presence.claimConnection(a, "conn-a");
    const t1 = Date.now();
    expect(await sendGps(a, "conn-a", DRIVER_A, t1)).toBe("accepted");

    expect(await sendGps(a, "conn-a", DRIVER_B, t1 - 5_000)).toBe("stale");

    const state = await redis.hgetall(stateKey(a));
    expect(state.sampledAtMs).toBe(String(t1));
    expect(await redis.geopos("driver:geo", a)).not.toBeNull();
  });

  it("9: duas atualizações concorrentes mantêm a mais recente", async () => {
    const a = userId("driver-a");
    await presence.claimConnection(a, "conn-a");
    const older = Date.now() - 2_000;
    const newer = Date.now() - 1_000;

    const results = await Promise.all([sendGps(a, "conn-a", DRIVER_A, older), sendGps(a, "conn-a", DRIVER_A, newer)]);

    expect(results).toContain("accepted");
    const state = await redis.hgetall(stateKey(a));
    expect(state.sampledAtMs).toBe(String(newer));
  });

  it("10: limpeza antiga não remove dados recém-renovados", async () => {
    const a = userId("driver-a");
    await presence.claimConnection(a, "conn-a");
    await sendGps(a, "conn-a", DRIVER_A, Date.now());

    // Uma "busca antiga" não pode remover a posição que outra conexão acaba
    // de renovar: o script reavalia a condição dentro da mesma execução.
    const nearby = await presence.findNearbyDrivers(DRIVER_A.lng, DRIVER_A.lat, 5_000, 10);
    expect(nearby.map(candidate => candidate.userId)).toEqual([a]);
    expect(await redis.zscore("driver:geo", a)).not.toBeNull();
  });

  it("11: coordenada coletada há minutos NÃO é elegível mesmo recebida agora", async () => {
    const a = userId("driver-a");
    await presence.claimConnection(a, "conn-a");
    // Sem estado anterior, a amostra é aceita (é a melhor disponível)…
    expect(await sendGps(a, "conn-a", DRIVER_A, Date.now() - 8 * 60 * 1000)).toBe("accepted");
    // …mas o duplo frescor (sampledAt recente E receivedAt recente) a exclui.
    const nearby = await presence.findNearbyDrivers(DRIVER_A.lng, DRIVER_A.lat, 5_000, 10);
    expect(nearby).toEqual([]);
  });

  it("11b: GPS com sampledAt futuro é rejeitado e não congela a posição (A1)", async () => {
    const a = userId("driver-a");
    await presence.claimConnection(a, "conn-a");

    // Posição real primeiro.
    const t1 = Date.now();
    expect(await sendGps(a, "conn-a", DRIVER_A, t1)).toBe("accepted");

    // Tentativa de envenenamento: sampledAt 9 minutos no futuro.
    expect(await sendGps(a, "conn-a", DRIVER_B, Date.now() + 9 * 60 * 1000)).toBe("future");

    // Nada foi gravado: a posição real permanece e o próximo GPS real é aceito.
    const state = await redis.hgetall(stateKey(a));
    expect(state.sampledAtMs).toBe(String(t1));

    expect(await sendGps(a, "conn-a", DRIVER_A, Date.now() + 2_000)).toBe("accepted");
    const nearby = await presence.findNearbyDrivers(DRIVER_A.lng, DRIVER_A.lat, 5_000, 10);
    expect(nearby.map(candidate => candidate.userId)).toEqual([a]);
  });

  it("11c: GPS dentro da tolerância futura é aceito (janela documentada)", async () => {
    const a = userId("driver-a");
    await presence.claimConnection(a, "conn-a");

    // +6 s está dentro da tolerância única de 10 s: aceito como o mais novo.
    expect(await sendGps(a, "conn-a", DRIVER_A, Date.now() + 6_000)).toBe("accepted");

    // Uma amostra "agora" chega depois: é anterior à futura aceita e é
    // ignorada pela ordenação até o relógio alcançá-la (janela curta e
    // documentada — trade-off da tolerância).
    expect(await sendGps(a, "conn-a", DRIVER_A, Date.now())).toBe("stale");
  });

  it("12: precisão insuficiente e precisão desconhecida não são elegíveis", async () => {
    const poor = userId("driver-poor");
    const unknown = userId("driver-unknown");
    await presence.claimConnection(poor, "conn-poor");
    await presence.claimConnection(unknown, "conn-unknown");
    expect(await sendGps(poor, "conn-poor", DRIVER_A, Date.now(), 5_000)).toBe("accepted");
    expect(
      await presence.recordLocation(unknown, "conn-unknown", {
        latitude: DRIVER_A.lat,
        longitude: DRIVER_A.lng,
        sampledAtMs: Date.now(),
      }),
    ).toBe("accepted");

    const nearby = await presence.findNearbyDrivers(DRIVER_A.lng, DRIVER_A.lat, 5_000, 10);
    expect(nearby).toEqual([]);
  });

  it("13: Redis indisponível rejeita — nenhuma confirmação em falso", async () => {
    const dead = new Redis("redis://127.0.0.1:6399/15", {
      lazyConnect: true,
      connectTimeout: 500,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      enableOfflineQueue: false,
    });
    const broken = new DriverPresenceService(dead, {
      presenceTtlMs: PRESENCE_TTL_MS,
      locationMaxAgeMs: LOCATION_MAX_AGE_MS,
    });

    try {
      await dead.connect().catch(() => undefined);

      await expect(broken.recordActivity(userId("driver-x"), "conn-x")).rejects.toThrow();
      await expect(
        broken.recordLocation(userId("driver-x"), "conn-x", {
          latitude: DRIVER_A.lat,
          longitude: DRIVER_A.lng,
          sampledAtMs: Date.now(),
        }),
      ).rejects.toThrow();
      await expect(broken.findNearbyDrivers(DRIVER_A.lng, DRIVER_A.lat, 5_000, 10)).rejects.toThrow();
    } finally {
      dead.disconnect();
    }
  });

  it("14: buscas repetidas produzem resultados estáveis", async () => {
    const a = userId("driver-a");
    await presence.claimConnection(a, "conn-a");
    await sendGps(a, "conn-a", DRIVER_A, Date.now());

    const first = await presence.findNearbyDrivers(DRIVER_A.lng, DRIVER_A.lat, 5_000, 10);
    const second = await presence.findNearbyDrivers(DRIVER_A.lng, DRIVER_A.lat, 5_000, 10);

    expect(first.map(candidate => candidate.userId)).toEqual([a]);
    expect(second.map(candidate => candidate.userId)).toEqual([a]);
  });

  it("15: limite de resultados e coordenadas inválidas são tratados", async () => {
    const ids = [userId("driver-l1"), userId("driver-l2"), userId("driver-l3")];
    for (const [index, id] of ids.entries()) {
      await presence.claimConnection(id, `conn-${index}`);
      await sendGps(id, `conn-${index}`, { lat: DRIVER_A.lat + index * 0.001, lng: DRIVER_A.lng }, Date.now());
    }

    const limited = await presence.findNearbyDrivers(DRIVER_A.lng, DRIVER_A.lat, 5_000, 2);
    expect(limited).toHaveLength(2);

    const invalid = await presence.recordLocation(userId("driver-invalid"), "conn-invalid", {
      latitude: 89.9, // além do limite Web Mercator do Redis GEO
      longitude: DRIVER_A.lng,
      sampledAtMs: Date.now(),
    });
    expect(invalid).toBe("invalid");
  });

  it("16: sobreseleção amplia a busca quando a página vem cheia de órfãos (A2)", async () => {
    // 16 órfãos (membro GEO sem estado) próximos ao ponto de busca preenchem
    // a página inicial (fetchCount inicial = max(limit*4, 16) = 16).
    const orphanCount = 16;
    for (let index = 0; index < orphanCount; index++) {
      await redis.geoadd("driver:geo", String(DRIVER_A.lng + index * 0.0001), String(DRIVER_A.lat), `orphan-${index}`);
    }

    // O motorista válido fica DEPOIS dos órfãos na ordenação por distância.
    const valid = userId("driver-valid");
    await presence.claimConnection(valid, "conn-valid");
    await sendGps(valid, "conn-valid", DRIVER_A, Date.now());

    const nearby = await presence.findNearbyDrivers(DRIVER_A.lng, DRIVER_A.lat, 5_000, 10);

    expect(nearby.map(candidate => candidate.userId)).toEqual([valid]);
    // Os órfãos foram limpos na leitura (ZREM condicional atômico).
    expect(await redis.zcard("driver:geo")).toBe(1);
  });

  it("17: claim de nova conexão invalida o GPS da substituída para a descoberta (verificação final 1)", async () => {
    // MESMO motorista, duas conexões (substituição real).
    const a = userId("driver-a");
    await presence.claimConnection(a, "conn-a");
    await sendGps(a, "conn-a", DRIVER_A, Date.now());

    // A posição do motorista é encontrada…
    let nearby = await presence.findNearbyDrivers(DRIVER_A.lng, DRIVER_A.lat, 5_000, 10);
    expect(nearby.map(candidate => candidate.userId)).toEqual([a]);

    // …a nova conexão assume SEM enviar localização: o motorista NÃO pode
    // mais aparecer na descoberta com a posição da conexão substituída.
    await presence.claimConnection(a, "conn-b");
    nearby = await presence.findNearbyDrivers(DRIVER_A.lng, DRIVER_A.lat, 5_000, 10);
    expect(nearby).toEqual([]);
    expect(await redis.zscore("driver:geo", a)).toBeNull();

    // O primeiro GPS da nova conexão devolve o motorista à descoberta.
    expect(await sendGps(a, "conn-b", DRIVER_A, Date.now())).toBe("accepted");
    nearby = await presence.findNearbyDrivers(DRIVER_A.lng, DRIVER_A.lat, 5_000, 10);
    expect(nearby.map(candidate => candidate.userId)).toEqual([a]);
  });
});
