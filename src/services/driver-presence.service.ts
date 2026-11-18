import type Redis from "ioredis";
import log from "encore.dev/log";
import { redis } from "@/infra/cache";
import { DRIVER_SAMPLE_FUTURE_TOLERANCE_MS } from "@/validations/driver-stream.validate";

/**
 * Presença e localização do motorista no Redis (Etapa 3 do MVP).
 *
 * Estado volátil compartilhado entre instâncias — o PostgreSQL continua sendo
 * a fonte de verdade de identidade, aprovação, disponibilidade ("Receber
 * corridas") e corridas. Aqui vive apenas:
 *
 *   - **Presença**: última atividade válida, medida com o HORÁRIO DO REDIS
 *     (nunca com o relógio do telefone), expirando por TTL. Heartbeat renova
 *     presença e NUNCA a validade da posição.
 *   - **Localização**: última amostra de GPS aceita, com `receivedAt` do
 *     servidor e `accuracyMeters`. Atualização ATÔMICA via script Lua: a
 *     comparação de `sampledAt` e o `GEOADD` acontecem na mesma execução —
 *     uma amostra antiga jamais sobrescreve uma mais nova sob concorrência.
 *   - **Propriedade da conexão**: cada conexão recebe um `connectionId`
 *     gerado PELO SERVIDOR, registrado atomicamente quando assume o estado.
 *     Somente a conexão dona pode renovar presença/GPS e limpá-lo ao
 *     encerrar — conexão antiga jamais sobrescreve, renova ou remove o
 *     estado de uma conexão mais recente ("a mais recente vence").
 *
 * Chaves (a menor estrutura que atende os invariantes):
 *   - `driver:geo`            ZSET GEO — membro: userId; índice de descoberta.
 *   - `driver:state:<userId>` HASH — connectionId, activityAtMs, receivedAtMs,
 *     sampledAtMs, accuracyMeters; TTL de presença renovado por atividade.
 *
 * Invariantes:
 *   - Localização pode estar obsoleta com presença viva (GPS parado,
 *     heartbeat ativo): a descoberta exige `sampledAt` E `receivedAt`
 *     recentes — coordenada coletada há minutos não serve para matching,
 *     mesmo que tenha acabado de chegar.
 *   - Presença pode expirar sem apagar o membro GEO: a descoberta faz
 *     limpeza oportunista condicional (verificação + ZREM no MESMO script
 *     atômico), nunca removendo estado que foi renovado durante a busca.
 *   - Redis indisponível ⇒ métodos rejeitam; nunca confirmam gravação em
 *     falso. Quem decide fail-closed (sem candidatos) é o chamador.
 */

/** TTL de presença: renovado por heartbeat e por GPS válido. */
export const DRIVER_PRESENCE_TTL_MS = 60_000;

/**
 * Idade máxima da localização para a descoberta geográfica, aplicada
 * INDEPENDENTEMENTE a `receivedAt` (recebimento no servidor) e a `sampledAt`
 * (coleta no dispositivo). Heartbeat não renova nenhuma das duas.
 */
export const DRIVER_LOCATION_MAX_AGE_MS = 45_000;

/**
 * Precisão máxima da última amostra para ELEGIBILIDADE DE MATCHING. O limite
 * de 100 km na validação do stream é sanidade de protocolo — não qualifica
 * uma posição para escolher motorista próximo.
 */
export const DRIVER_MAX_ACCURACY_FOR_MATCHING_M = 200;

const GEO_KEY = "driver:geo";
const stateKey = (userId: string): string => `driver:state:${userId}`;

/** Limites aceitos pelo Redis GEO (projeção Web Mercator). */
const REDIS_GEO_MAX_LATITUDE = 85.05112878;

export interface DriverLocationSample {
  latitude: number;
  longitude: number;
  /** Instante da amostra no dispositivo, epoch ms (já validado pelo Zod). */
  sampledAtMs: number;
  /** Precisão em metros, quando o dispositivo informa. */
  accuracyMeters?: number;
}

export interface NearbyDriver {
  userId: string;
  /** Distância do ponto de busca, em metros (calculada pelo Redis). */
  distanceMeters: number;
  /** Recebimento no servidor da amostra aceita (epoch ms, relógio do Redis). */
  receivedAtMs: number;
  /** Coleta no dispositivo da amostra aceita (epoch ms). */
  sampledAtMs: number;
  accuracyMeters: number | null;
}

export type RecordLocationResult = "accepted" | "stale" | "superseded" | "absent" | "future" | "invalid";
export type RecordActivityResult = "renewed" | "superseded" | "absent";
export type ReleaseConnectionResult = "released" | "not-owner" | "absent";

export interface DriverPresenceOptions {
  presenceTtlMs?: number;
  locationMaxAgeMs?: number;
  maxAccuracyMeters?: number;
  futureToleranceMs?: number;
}

/** Contrato consumido pelo DriverStreamService (injetável para testes). */
export interface DriverPresenceGateway {
  /** A conexão mais recente assume a propriedade do estado, atomicamente. */
  claimConnection(userId: string, connectionId: string): Promise<void>;
  recordActivity(userId: string, connectionId: string): Promise<RecordActivityResult>;
  recordLocation(userId: string, connectionId: string, location: DriverLocationSample): Promise<RecordLocationResult>;
  releaseConnection(userId: string, connectionId: string): Promise<ReleaseConnectionResult>;
}

// ARGV do CLAIM: 1 connectionId, 2 userId (membro GEO), 3 ttlMs.
// A propriedade é assumida atomicamente E o GPS anterior é invalidado na
// MESMA execução: a posição pertence à conexão que a coletou — uma conexão
// nova que ainda não enviou localização NÃO pode aparecer em
// findNearbyDrivers() usando a posição da conexão substituída.
// HDEL remove os metadados de GPS e ZREM retira o membro do índice até a
// primeira amostra válida da nova conexão (GEOADD re-adiciona). Operações
// idempotentes no primeiro claim (campos/membro inexistentes são no-op).
const CLAIM_SCRIPT = `
local time = redis.call('TIME')
local nowMs = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
redis.call('HSET', KEYS[1], 'connectionId', ARGV[1], 'activityAtMs', nowMs)
redis.call('HDEL', KEYS[1], 'receivedAtMs', 'sampledAtMs', 'accuracyMeters')
redis.call('ZREM', KEYS[2], ARGV[2])
redis.call('PEXPIRE', KEYS[1], ARGV[3])
return 1
`;

// Heartbeat: renove presença SOMENTE se a conexão ainda for a dona. NÃO cria
// estado: uma conexão substituída jamais recupera a propriedade por heartbeat,
// mesmo após a expiração do TTL. Recuperação = reconexão (claim) ou… nada,
// pois presença sem GPS fresco não é elegível de qualquer forma.
// Códigos: 1 renovado; -1 superseded; -3 ausente (sem estado).
const ACTIVITY_SCRIPT = `
local time = redis.call('TIME')
local nowMs = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
if redis.call('EXISTS', KEYS[1]) == 0 then
  return -3
end
if redis.call('HGET', KEYS[1], 'connectionId') ~= ARGV[1] then
  return -1
end
redis.call('HSET', KEYS[1], 'activityAtMs', nowMs)
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return 1
`;

// GPS atômico. ARGV: 1 connectionId, 2 ttlMs, 3 sampledAtMs,
// 4 accuracy ('' se nulo), 5 longitude, 6 latitude, 7 userId (membro GEO),
// 8 tolerância futura (mesma constante do Zod — autoridade: TIME do Redis).
// Ordem exigida pelo GEOADD: longitude ANTES de latitude.
// TODAS as validações precedem qualquer escrita (Lua não tem rollback de
// escritas anteriores em falha de script — nada é escrito antes de tudo
// validar). Códigos: 1 aceito; 0 stale (antiga/duplicada); -1 superseded;
// -2 sampledAt futuro; -3 ausente (sem estado — sem propriedade válida).
const LOCATION_SCRIPT = `
local time = redis.call('TIME')
local nowMs = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
if redis.call('EXISTS', KEYS[1]) == 0 then
  return -3
end
if redis.call('HGET', KEYS[1], 'connectionId') ~= ARGV[1] then
  return -1
end
local sampled = tonumber(ARGV[3])
if sampled > nowMs + tonumber(ARGV[8]) then
  return -2
end
local current = tonumber(redis.call('HGET', KEYS[1], 'sampledAtMs'))
if current and sampled <= current then
  return 0
end
redis.call('GEOADD', KEYS[2], ARGV[5], ARGV[6], ARGV[7])
redis.call('HSET', KEYS[1],
  'connectionId', ARGV[1],
  'sampledAtMs', ARGV[3],
  'receivedAtMs', nowMs,
  'activityAtMs', nowMs,
  'accuracyMeters', ARGV[4])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return 1
`;

// Desconexão: limpa o estado SOMENTE se esta conexão ainda for a dona
// (verificação e remoção no mesmo script atômico).
const RELEASE_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 0 then
  return 0
end
if redis.call('HGET', KEYS[1], 'connectionId') ~= ARGV[1] then
  return -1
end
redis.call('DEL', KEYS[1])
redis.call('ZREM', KEYS[2], ARGV[2])
return 1
`;

// Limpeza oportunista + leitura do estado de um membro GEO, atomicamente:
// estado ausente (presença vencida) ⇒ ZREM do membro órfão e nil;
// estado presente ⇒ campos + nowMs do relógio do Redis para filtragem
// consistente entre instâncias. Uma busca concorrente jamais remove estado
// renovado: a condição de expiração é reavaliada dentro do script.
const READ_OR_CLEAN_SCRIPT = `
local time = redis.call('TIME')
local nowMs = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
if redis.call('EXISTS', KEYS[1]) == 0 then
  redis.call('ZREM', KEYS[2], ARGV[1])
  return nil
end
local fields = redis.call('HMGET', KEYS[1], 'connectionId', 'activityAtMs', 'receivedAtMs', 'sampledAtMs', 'accuracyMeters')
return { fields[1], fields[2], fields[3], fields[4], fields[5], nowMs }
`;

export class DriverPresenceService implements DriverPresenceGateway {
  private readonly presenceTtlMs: number;
  private readonly locationMaxAgeMs: number;
  private readonly maxAccuracyMeters: number;
  private readonly futureToleranceMs: number;

  constructor(
    private readonly redis: Redis,
    options: DriverPresenceOptions = {},
  ) {
    this.presenceTtlMs = options.presenceTtlMs ?? DRIVER_PRESENCE_TTL_MS;
    this.locationMaxAgeMs = options.locationMaxAgeMs ?? DRIVER_LOCATION_MAX_AGE_MS;
    this.maxAccuracyMeters = options.maxAccuracyMeters ?? DRIVER_MAX_ACCURACY_FOR_MATCHING_M;
    this.futureToleranceMs = options.futureToleranceMs ?? DRIVER_SAMPLE_FUTURE_TOLERANCE_MS;
  }

  /**
   * A conexão mais recente assume a propriedade do estado do motorista E
   * invalida atomicamente o GPS da conexão substituída (HDEL dos metadados +
   * ZREM do membro GEO): sem localização própria, a nova conexão não aparece
   * na descoberta com a posição da anterior.
   */
  async claimConnection(userId: string, connectionId: string): Promise<void> {
    await this.redis.eval(CLAIM_SCRIPT, 2, stateKey(userId), GEO_KEY, connectionId, userId, String(this.presenceTtlMs));
  }

  /**
   * Heartbeat: renove presença/atividade SOMENTE se a conexão for a dona.
   * Não altera coordenadas nem os instantes da amostra GPS, e NÃO cria
   * estado: conexão substituída (ou estado expirado) jamais recupera a
   * propriedade por heartbeat. `absent` ⇒ estado expirado — a recuperação
   * é reconexão (claim) ou nova posição... que também exige ser dona: o
   * stream encerra a conexão para re-claim controlado.
   */
  async recordActivity(userId: string, connectionId: string): Promise<RecordActivityResult> {
    const result = await this.redis.eval(
      ACTIVITY_SCRIPT,
      1,
      stateKey(userId),
      connectionId,
      String(this.presenceTtlMs),
    );
    if (result === -3) return "absent";
    return result === 1 ? "renewed" : "superseded";
  }

  /**
   * GPS: atualização atômica. TODAS as validações precedem qualquer escrita
   * (Lua não tem rollback — nada é escrito antes de tudo validar).
   * `stale` = amostra antiga/duplicada ignorada; `future` = amostra com
   * horário futuro além da tolerância (relógio do Redis decide); `superseded`
   * = outra conexão assumiu o estado; `absent` = estado expirado (sem
   * propriedade válida — recuperação por reconexão); `invalid` = fora dos
   * limites aceitos pelo Redis GEO.
   */
  async recordLocation(
    userId: string,
    connectionId: string,
    location: DriverLocationSample,
  ): Promise<RecordLocationResult> {
    const { latitude, longitude, sampledAtMs } = location;
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > REDIS_GEO_MAX_LATITUDE ||
      longitude < -180 ||
      longitude > 180 ||
      !Number.isFinite(sampledAtMs)
    ) {
      return "invalid";
    }

    const result = await this.redis.eval(
      LOCATION_SCRIPT,
      2,
      stateKey(userId),
      GEO_KEY,
      connectionId,
      String(this.presenceTtlMs),
      String(sampledAtMs),
      location.accuracyMeters === undefined ? "" : String(location.accuracyMeters),
      String(longitude),
      String(latitude),
      userId,
      String(this.futureToleranceMs),
    );

    switch (result) {
      case -1:
        return "superseded";
      case -2:
        return "future";
      case -3:
        return "absent";
      default:
        return result === 1 ? "accepted" : "stale";
    }
  }

  /**
   * Desconexão: limpa o estado SOMENTE se esta conexão ainda for a dona.
   * Conexão antiga jamais apaga o estado de uma conexão mais recente.
   * NÃO é chamada no aceite de corrida — o motorista continua conectado
   * enviando GPS durante a viagem.
   */
  async releaseConnection(userId: string, connectionId: string): Promise<ReleaseConnectionResult> {
    const result = await this.redis.eval(RELEASE_SCRIPT, 2, stateKey(userId), GEO_KEY, connectionId, userId);
    if (result === 1) return "released";
    if (result === -1) return "not-owner";
    return "absent";
  }

  /**
   * Presença = estado existe no Redis (TTL de atividade válido). O Map local
   * de conexões NÃO decide presença global.
   */
  async isPresent(userId: string): Promise<boolean> {
    return (await this.redis.exists(stateKey(userId))) === 1;
  }

  /**
   * Descoberta geográfica: proximidade + presença viva + GPS com `sampledAt`
   * E `receivedAt` dentro da idade máxima + precisão suficiente. NÃO é
   * autorização final para oferta — o DispatchService ainda verificará
   * aprovação, "Receber corridas" e corrida ativa no PostgreSQL.
   *
   * Membros órfãos (presença vencida) são removidos condicionalmente na
   * própria leitura, atomicamente. Sobreseleção limitada: busca inicial com
   * `4×limit` e, se a página vier cheia, amplia em até 3 rodadas — SEM
   * `COUNT ANY` (preserva a ordenação exata por proximidade) e com teto de
   * 256 membros por página. LIMITAÇÃO DOCUMENTADA: em densidades acima do
   * teto, motoristas válidos além da página 3 não são descobertos nesta
   * consulta (decisão proporcional ao MVP; ampliar apenas com evidência).
   *
   * Erros do Redis são propagados — o chamador decide o fail-closed.
   */
  async findNearbyDrivers(
    longitude: number,
    latitude: number,
    radiusMeters: number,
    limit: number,
  ): Promise<NearbyDriver[]> {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || radiusMeters <= 0 || limit <= 0) {
      return [];
    }

    const candidates: NearbyDriver[] = [];
    let fetchCount = Math.min(Math.max(limit * 4, 16), 256);

    for (let round = 0; round < 3 && candidates.length < limit; round++) {
      const raw = await this.geosearch(longitude, latitude, radiusMeters, fetchCount);
      const filtered = await this.filterEligible(raw, limit);

      for (const candidate of filtered) {
        if (candidates.length >= limit) break;
        if (!candidates.some(existing => existing.userId === candidate.userId)) {
          candidates.push(candidate);
        }
      }

      // Página cheia (membros retornados = página solicitada) e resultados
      // insuficientes ⇒ pode haver membros válidos além da página; ampliar
      // de forma limitada. Formato aninhado do ioredis: raw.length = nº de
      // membros, não o dobro.
      const pageFull = raw.length >= fetchCount;
      if (!pageFull || fetchCount >= 256) break;
      fetchCount = Math.min(fetchCount * 2, 256);
    }

    return candidates;
  }

  private async geosearch(
    longitude: number,
    latitude: number,
    radiusMeters: number,
    count: number,
  ): Promise<Array<{ member: string; distanceMeters: number }>> {
    const raw = (await this.redis.geosearch(
      GEO_KEY,
      "FROMLONLAT",
      String(longitude),
      String(latitude),
      "BYRADIUS",
      String(radiusMeters),
      "m",
      "ASC",
      "COUNT",
      String(count),
      "WITHDIST",
    )) as unknown[];

    // ioredis devolve pares aninhados ([["user", "12.3"], ...]); tolerar
    // também o formato plano do Redis puro ([member, dist, ...]).
    const members: Array<{ member: string; distanceMeters: number }> = [];
    for (const entry of raw) {
      if (Array.isArray(entry)) {
        const member = String(entry[0]);
        const distance = Number(entry[1]);
        if (Number.isFinite(distance)) members.push({ member, distanceMeters: distance });
        continue;
      }

      const position = members.length * 2;
      const distance = Number(raw[position + 1]);
      if (Number.isFinite(distance)) {
        members.push({ member: String(entry), distanceMeters: distance });
      }
    }
    return members;
  }

  /**
   * Filtra candidatos pelo estado Redis, atomicamente por membro:
   * presença viva (estado existe), `receivedAt` e `sampledAt` dentro da
   * idade máxima, precisão suficiente. Membros órfãos são removidos do
   * índice GEO na leitura (script atômico). Precisão desconhecida NÃO é
   * elegível (não dá para confirmar que serve para matching).
   */
  private async filterEligible(
    members: Array<{ member: string; distanceMeters: number }>,
    limit: number,
  ): Promise<NearbyDriver[]> {
    if (members.length === 0) return [];

    const pipeline = this.redis.pipeline();
    for (const { member } of members) {
      pipeline.eval(READ_OR_CLEAN_SCRIPT, 2, stateKey(member), GEO_KEY, member);
    }

    const results = await pipeline.exec();
    if (!results) {
      throw new Error("Pipeline do Redis não retornou resultados.");
    }
    const eligible: NearbyDriver[] = [];

    for (let index = 0; index < members.length && eligible.length < limit; index++) {
      const outcome = results[index];
      if (!outcome || outcome[0]) {
        if (outcome?.[0])
          log.warn("Falha ao ler estado de presença no Redis.", {
            member: members[index].member,
            errorName: outcome[0] instanceof Error ? outcome[0].name : "unknown",
          });
        continue;
      }

      const raw = outcome[1];
      if (!Array.isArray(raw)) continue; // órfão: já removido pelo script

      const [, , receivedAtRaw, sampledAtRaw, accuracyRaw, nowRaw] = raw as Array<string | number | null>;
      const receivedAtMs = Number(receivedAtRaw);
      const sampledAtMs = Number(sampledAtRaw);
      const nowMs = Number(nowRaw);
      if (!Number.isFinite(receivedAtMs) || !Number.isFinite(sampledAtMs) || !Number.isFinite(nowMs)) {
        continue;
      }

      // Duplo frescor: recebimento recente E coleta recente. Heartbeat não
      // renova nenhuma das duas. Limite INFERIOR de idade: amostra futura
      // (além da tolerância) não pode passar porque `now - sampledAt` seria
      // negativo — coordena com a validação atômica da gravação.
      if (nowMs - receivedAtMs > this.locationMaxAgeMs) continue;
      if (nowMs - sampledAtMs > this.locationMaxAgeMs) continue;
      if (sampledAtMs - nowMs > this.futureToleranceMs) continue;

      const accuracy = accuracyRaw === "" || accuracyRaw === null ? null : Number(accuracyRaw);
      if (accuracy === null || !Number.isFinite(accuracy) || accuracy > this.maxAccuracyMeters) {
        continue;
      }

      eligible.push({
        userId: members[index].member,
        distanceMeters: members[index].distanceMeters,
        receivedAtMs,
        sampledAtMs,
        accuracyMeters: accuracy,
      });
    }

    return eligible;
  }
}

export const driverPresenceService = new DriverPresenceService(redis);
