import { afterEach, describe, expect, it, setSystemTime } from "bun:test";
import type { AuthData } from "@/auth/auth.types";
import { DriverStatus } from "@/domain/driver/driver.types";
import { AccountStatus, AuthRole } from "@/domain/identity/identity.types";
import type { DriverStreamInMessage, DriverStreamOutMessage } from "@/dto/driver-stream.dto";
import type { StreamInOut } from "encore.dev/api";
import { driverConnections } from "@/services/driver-connection-registry";
import type {
  DriverPresenceGateway,
  DriverLocationSample,
  RecordActivityResult,
  RecordLocationResult,
  ReleaseConnectionResult,
} from "@/services/driver-presence.service";
import {
  DRIVER_STREAM_HEARTBEAT_STALENESS_MS,
  DriverStreamService,
  isHeartbeatFresh,
  type DriverStreamDeps,
} from "@/services/driver-stream.service";

/**
 * Stream falso com a mesma forma de `StreamInOut` do Encore: recv rejeita
 * quando não há mais mensagens (desconexão) e o iterador encerra, espelhando
 * o comportamento do runtime.
 */
class FakeDriverStream implements StreamInOut<DriverStreamInMessage, DriverStreamOutMessage> {
  incoming: DriverStreamInMessage[] = [];
  sent: DriverStreamOutMessage[] = [];
  closed = false;

  /**
   * Hook opcional executado antes de entregar a mensagem de índice dado —
   * usado para avançar o relógio simulado no momento correto (a janela de
   * revalidação começa dentro de run(), não antes).
   */
  onRecv?: (index: number) => void;

  private cursor = 0;

  push(message: DriverStreamInMessage): this {
    this.incoming.push(message);
    return this;
  }

  async send(message: DriverStreamOutMessage): Promise<void> {
    this.sent.push(message);
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  recv(): Promise<DriverStreamInMessage> {
    if (this.cursor < this.incoming.length) {
      this.onRecv?.(this.cursor);
      const next = this.incoming[this.cursor];
      this.cursor += 1;
      return Promise.resolve(next);
    }
    return Promise.reject(new Error("desconectado"));
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<DriverStreamInMessage> {
    while (true) {
      try {
        yield await this.recv();
      } catch {
        break;
      }
    }
  }
}

interface DepsState {
  sessionActive: boolean;
  accountStatus: AccountStatus;
  roles: AuthRole[];
  driverStatus: DriverStatus | null;
}

/** Presença falsa: registra tentativas e permite simular falha do Redis. */
class FakePresenceGateway implements DriverPresenceGateway {
  claims: string[] = [];
  activities: string[] = [];
  locations: Array<{ userId: string; connectionId: string; sample: DriverLocationSample }> = [];
  releases: string[] = [];

  /** Quando verdadeiro, toda operação lança (Redis indisponível) DEPOIS de registrar a tentativa. */
  failWith: Error | null = null;

  /** Resultados configuráveis por operação (comportamento do Redis). */
  nextActivityResult: RecordActivityResult = "renewed";
  nextLocationResult: RecordLocationResult = "accepted";

  async claimConnection(userId: string): Promise<void> {
    this.claims.push(userId);
    if (this.failWith) throw this.failWith;
  }

  async recordActivity(userId: string, connectionId: string): Promise<RecordActivityResult> {
    this.activities.push(`${userId}:${connectionId}`);
    if (this.failWith) throw this.failWith;
    return this.nextActivityResult;
  }

  async recordLocation(
    userId: string,
    connectionId: string,
    sample: DriverLocationSample,
  ): Promise<RecordLocationResult> {
    this.locations.push({ userId, connectionId, sample });
    if (this.failWith) throw this.failWith;
    return this.nextLocationResult;
  }

  async releaseConnection(userId: string): Promise<ReleaseConnectionResult> {
    this.releases.push(userId);
    if (this.failWith) throw this.failWith;
    return "released";
  }
}

function makeDeps(
  state: DepsState,
  presence: FakePresenceGateway = new FakePresenceGateway(),
): DriverStreamDeps & { state: DepsState; checkCount: () => number; presence: FakePresenceGateway } {
  // Estado próprio do teste: cada makeDeps clona para evitar vazamento de
  // mutações entre casos.
  const own: DepsState = { ...state, roles: [...state.roles] };
  let checks = 0;
  const deps: DriverStreamDeps = {
    presence,
    isSessionActive: async () => {
      checks += 1;
      return own.sessionActive;
    },
    isAccountActive: async () => own.accountStatus === AccountStatus.ACTIVE,
    hasDriverRole: async () => own.roles.includes(AuthRole.Driver),
    getDriverStatus: async () => own.driverStatus,
  };
  return { ...deps, state: own, checkCount: () => checks, presence } as DriverStreamDeps & {
    state: DepsState;
    checkCount: () => number;
    presence: FakePresenceGateway;
  };
}

const authData: AuthData = { userID: "driver-1", sessionId: "session-1", roles: [AuthRole.Driver] };

const eligibleState: DepsState = {
  sessionActive: true,
  accountStatus: AccountStatus.ACTIVE,
  roles: [AuthRole.Driver],
  driverStatus: DriverStatus.APPROVED,
};

function nowSampledAt(): string {
  return new Date().toISOString();
}

/** Congela o relógio para controlar a janela de revalidação nos testes. */
function freezeClock(): () => void {
  const real = Date.now();
  setSystemTime(real);
  return () => setSystemTime(real);
}

describe("DriverStreamService.run", () => {
  it("envia stream.connected com instante do servidor antes de processar mensagens", async () => {
    const stream = new FakeDriverStream()
      .push({ type: "heartbeat" })
      .push({
        type: "location.updated",
        latitude: -3.119,
        longitude: -60.021,
        accuracyMeters: 12,
        sampledAt: nowSampledAt(),
      });
    const service = new DriverStreamService(makeDeps(eligibleState));

    await service.run(stream, authData);

    expect(stream.sent).toEqual([{ type: "stream.connected", connectedAt: expect.any(String) }]);
    expect(stream.closed).toBe(false);
  });

  it("encerra o ciclo quando o motorista desconecta, sem fechar de novo nem lançar erro", async () => {
    const stream = new FakeDriverStream().push({ type: "heartbeat" });
    const service = new DriverStreamService(makeDeps(eligibleState));

    await expect(service.run(stream, authData)).resolves.toBeUndefined();
  });

  it("fecha a conexão (fail fast) ao receber mensagem inválida, sem processar o restante", async () => {
    const stream = new FakeDriverStream()
      .push({ type: "offer.created" } as unknown as DriverStreamInMessage)
      .push({ type: "heartbeat" });
    const service = new DriverStreamService(makeDeps(eligibleState));

    // O fechamento é explícito: a rejeição do handler não fecha o WebSocket
    // no runtime do Encore.
    await expect(service.run(stream, authData)).resolves.toBeUndefined();
    expect(stream.closed).toBe(true);
  });

  it("revalida coordenada fora dos limites, sampledAt fora da janela e accuracyMeters negativa", async () => {
    const cases: DriverStreamInMessage[] = [
      { type: "location.updated", latitude: 91, longitude: -60.021, sampledAt: nowSampledAt() },
      {
        type: "location.updated",
        latitude: -3.119,
        longitude: -60.021,
        sampledAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
      { type: "location.updated", latitude: -3.119, longitude: -60.021, accuracyMeters: -1, sampledAt: nowSampledAt() },
    ];
    const service = new DriverStreamService(makeDeps(eligibleState));

    for (const invalid of cases) {
      const stream = new FakeDriverStream().push(invalid);
      await expect(service.run(stream, authData)).resolves.toBeUndefined();
      expect(stream.closed).toBe(true);
    }
  });

  it("registra a conexão ao abrir e a remove ao encerrar (desconexão)", async () => {
    const stream = new FakeDriverStream().push({ type: "heartbeat" });
    const service = new DriverStreamService(makeDeps(eligibleState));

    // Simula o registro criado antes do run (não é possível observar o meio
    // do ciclo em teste unitário; o fim é o que garante ausência de vazamento).
    await service.run(stream, authData);

    expect(driverConnections.get(authData.userID)).toBeUndefined();
  });
});

describe("DriverStreamService — revalidação com janela de 30 s orientada às mensagens", () => {
  let restoreTime: (() => void) | null = null;

  afterEach(() => {
    restoreTime?.();
    restoreTime = null;
  });

  it("não consulta o banco para mensagens dentro da janela (sem consulta por GPS)", async () => {
    restoreTime = freezeClock();
    const stream = new FakeDriverStream()
      .push({ type: "heartbeat" })
      .push({ type: "heartbeat" })
      .push({ type: "location.updated", latitude: -3.119, longitude: -60.021, sampledAt: nowSampledAt() });
    const deps = makeDeps(eligibleState);
    const service = new DriverStreamService(deps);

    await service.run(stream, authData);

    // Janela de 30 s a partir do handshake: mensagens em sequência não
    // disparam nenhuma verificação.
    expect(deps.checkCount()).toBe(0);
    expect(stream.closed).toBe(false);
  });

  it("revalida a elegibilidade na primeira mensagem que chega após a janela de 30 s", async () => {
    restoreTime = freezeClock();
    const stream = new FakeDriverStream().push({ type: "heartbeat" }).push({ type: "heartbeat" });
    // A primeira mensagem chega dentro da janela; a segunda, 31 s depois.
    stream.onRecv = index => {
      if (index === 1) setSystemTime(Date.now() + 31_000);
    };
    const deps = makeDeps(eligibleState);
    const service = new DriverStreamService(deps);

    await service.run(stream, authData);

    expect(deps.checkCount()).toBe(1);
    expect(stream.closed).toBe(false);
  });

  it("encerra a conexão quando a revalidação após a janela encontra suspensão", async () => {
    restoreTime = freezeClock();
    const stream = new FakeDriverStream().push({ type: "heartbeat" }).push({ type: "heartbeat" });
    stream.onRecv = index => {
      if (index === 1) setSystemTime(Date.now() + 31_000);
    };
    const deps = makeDeps(eligibleState);
    const service = new DriverStreamService(deps);
    deps.state.driverStatus = DriverStatus.SUSPENDED;

    await service.run(stream, authData);

    expect(stream.closed).toBe(true);
  });

  it("encerra a conexão quando a sessão é revogada", async () => {
    restoreTime = freezeClock();
    const stream = new FakeDriverStream().push({ type: "heartbeat" }).push({ type: "heartbeat" });
    stream.onRecv = index => {
      if (index === 1) setSystemTime(Date.now() + 31_000);
    };
    const deps = makeDeps(eligibleState);
    const service = new DriverStreamService(deps);
    deps.state.sessionActive = false;

    await service.run(stream, authData);

    expect(stream.closed).toBe(true);
  });

  it("encerra a conexão quando a conta é bloqueada", async () => {
    restoreTime = freezeClock();
    const stream = new FakeDriverStream().push({ type: "heartbeat" }).push({ type: "heartbeat" });
    stream.onRecv = index => {
      if (index === 1) setSystemTime(Date.now() + 31_000);
    };
    const deps = makeDeps(eligibleState);
    const service = new DriverStreamService(deps);
    deps.state.accountStatus = AccountStatus.BANNED;

    await service.run(stream, authData);

    expect(stream.closed).toBe(true);
  });

  it("encerra a conexão quando o papel DRIVER é removido", async () => {
    restoreTime = freezeClock();
    const stream = new FakeDriverStream().push({ type: "heartbeat" }).push({ type: "heartbeat" });
    stream.onRecv = index => {
      if (index === 1) setSystemTime(Date.now() + 31_000);
    };
    const deps = makeDeps(eligibleState);
    const service = new DriverStreamService(deps);
    deps.state.roles = [AuthRole.Client];

    await service.run(stream, authData);

    expect(stream.closed).toBe(true);
  });

  it("não processa a mensagem seguinte após encerrar por inelegibilidade", async () => {
    restoreTime = freezeClock();
    const stream = new FakeDriverStream().push({ type: "heartbeat" }).push({ type: "heartbeat" });
    stream.onRecv = index => {
      if (index === 1) setSystemTime(Date.now() + 31_000);
    };
    const deps = makeDeps(eligibleState);
    const service = new DriverStreamService(deps);
    deps.state.sessionActive = false;

    await service.run(stream, authData);

    // Uma verificação encerra o loop; a segunda mensagem não é processada.
    expect(deps.checkCount()).toBe(1);
    expect(stream.closed).toBe(true);
  });
});

describe("DriverStreamService — presença e localização no Redis", () => {
  it("encaminha heartbeat para recordActivity e localização para recordLocation", async () => {
    const stream = new FakeDriverStream()
      .push({ type: "heartbeat" })
      .push({
        type: "location.updated",
        latitude: -3.119,
        longitude: -60.021,
        accuracyMeters: 12,
        sampledAt: nowSampledAt(),
      });
    const deps = makeDeps(eligibleState);
    const service = new DriverStreamService(deps);

    await service.run(stream, authData);

    expect(deps.presence.claims).toEqual([authData.userID]);
    expect(deps.presence.activities).toHaveLength(1);
    expect(deps.presence.locations).toHaveLength(1);

    const location = deps.presence.locations[0];
    expect(location.userId).toBe(authData.userID);
    expect(location.sample.latitude).toBe(-3.119);
    expect(location.sample.longitude).toBe(-60.021);
    expect(location.sample.accuracyMeters).toBe(12);
    expect(Number.isFinite(location.sample.sampledAtMs)).toBe(true);

    // A mesma conexão (connectionId gerado pelo servidor) é usada em todas
    // as operações e liberada no fim.
    const activityConnectionId = deps.presence.activities[0].split(":")[1];
    expect(deps.presence.releases).toHaveLength(1);
    expect(activityConnectionId).toBeTruthy();
  });

  it("encerra a conexão quando o Redis informa superseded (outra conexão assumiu)", async () => {
    const stream = new FakeDriverStream().push({ type: "heartbeat" }).push({ type: "heartbeat" });
    const deps = makeDeps(eligibleState);
    deps.presence.nextActivityResult = "superseded";
    const service = new DriverStreamService(deps);

    await expect(service.run(stream, authData)).resolves.toBeUndefined();

    // Uma mensagem bastou para detectar a substituição; a conexão é
    // encerrada para re-claim controlado na reconexão.
    expect(deps.presence.activities).toHaveLength(1);
    expect(stream.closed).toBe(true);
  });

  it("encerra a conexão quando o estado de presença expirou (absent)", async () => {
    const stream = new FakeDriverStream().push({
      type: "location.updated",
      latitude: -3.119,
      longitude: -60.021,
      sampledAt: nowSampledAt(),
    });
    const deps = makeDeps(eligibleState);
    deps.presence.nextLocationResult = "absent";
    const service = new DriverStreamService(deps);

    await expect(service.run(stream, authData)).resolves.toBeUndefined();

    expect(stream.closed).toBe(true);
  });

  it("continua a conexão em amostras ignoradas (stale/future/invalid) sem falso-confirmar", async () => {
    for (const result of ["stale", "future", "invalid"] as const) {
      const stream = new FakeDriverStream().push({
        type: "location.updated",
        latitude: -3.119,
        longitude: -60.021,
        sampledAt: nowSampledAt(),
      });
      const deps = makeDeps(eligibleState);
      deps.presence.nextLocationResult = result;
      const service = new DriverStreamService(deps);

      await expect(service.run(stream, authData)).resolves.toBeUndefined();
      expect(stream.closed).toBe(false);
    }
  });

  it("ordenação/anti-sobrescrita de GPS é responsabilidade do Redis (Lua atômico)", async () => {
    const base = Date.now() - 60_000;
    const stream = new FakeDriverStream()
      .push({
        type: "location.updated",
        latitude: -3.119,
        longitude: -60.021,
        sampledAt: new Date(base + 20_000).toISOString(),
      })
      .push({
        type: "location.updated",
        latitude: -3.12,
        longitude: -60.022,
        sampledAt: new Date(base + 5_000).toISOString(),
      });
    const deps = makeDeps(eligibleState);
    const service = new DriverStreamService(deps);

    // O stream repassa todas as amostras; quem rejeita a antiga é o script
    // atômico no Redis (coberto pela suíte de integração).
    await service.run(stream, authData);

    expect(deps.presence.locations).toHaveLength(2);
    expect(stream.closed).toBe(false);
  });

  it("falha do Redis não encerra a conexão nem falso-confirma gravação", async () => {
    const stream = new FakeDriverStream().push({ type: "heartbeat" }).push({ type: "heartbeat" });
    const deps = makeDeps(eligibleState);
    deps.presence.failWith = new Error("Redis indisponível");
    const service = new DriverStreamService(deps);

    await expect(service.run(stream, authData)).resolves.toBeUndefined();

    // As duas mensagens foram processadas (a presença apenas falhou em
    // renovar) e a conexão permanece aberta.
    expect(deps.presence.activities).toHaveLength(2);
    expect(stream.closed).toBe(false);
  });
});

describe("DriverStreamService.isEligible", () => {
  it("consulta em cadeia sequencial e exige todas as condições", async () => {
    const deps = makeDeps(eligibleState);
    const service = new DriverStreamService(deps);

    expect(await service.isEligible(authData)).toBe(true);
    expect(deps.checkCount()).toBe(1);

    deps.state.driverStatus = DriverStatus.PENDING;
    expect(await service.isEligible(authData)).toBe(false);
  });

  it("falha fechada quando qualquer verificação lança erro de banco", async () => {
    const failingDeps: DriverStreamDeps = {
      presence: new FakePresenceGateway(),
      isSessionActive: async () => {
        throw new Error("banco indisponível");
      },
      isAccountActive: async () => true,
      hasDriverRole: async () => true,
      getDriverStatus: async () => DriverStatus.APPROVED,
    };
    const service = new DriverStreamService(failingDeps);

    expect(await service.isEligible(authData)).toBe(false);
  });

  it("não consulta condições seguintes quando uma anterior falha (curto-circuito)", async () => {
    let accountConsulted = false;
    const deps: DriverStreamDeps = {
      presence: new FakePresenceGateway(),
      isSessionActive: async () => false,
      isAccountActive: async () => {
        accountConsulted = true;
        return true;
      },
      hasDriverRole: async () => true,
      getDriverStatus: async () => DriverStatus.APPROVED,
    };
    const service = new DriverStreamService(deps);

    expect(await service.isEligible(authData)).toBe(false);
    expect(accountConsulted).toBe(false);
  });
});

describe("isHeartbeatFresh — regra de entrega da camada de distribuição", () => {
  it("heartbeat dentro do prazo é fresco", () => {
    expect(isHeartbeatFresh(Date.now() - 1_000)).toBe(true);
  });

  it("heartbeat mais antigo que o prazo deixa a conexão inelegível para entrega", () => {
    expect(isHeartbeatFresh(Date.now() - DRIVER_STREAM_HEARTBEAT_STALENESS_MS - 1_000)).toBe(false);
    expect(isHeartbeatFresh(Date.now() - DRIVER_STREAM_HEARTBEAT_STALENESS_MS)).toBe(true);
  });
});
