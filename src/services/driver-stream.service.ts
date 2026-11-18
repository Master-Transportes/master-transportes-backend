import log from "encore.dev/log";
import { randomUUID } from "node:crypto";
import type { StreamInOut } from "encore.dev/api";
import type { AuthData } from "@/auth/auth.types";
import type { DriverStreamInMessage, DriverStreamOutMessage } from "@/dto/driver-stream.dto";
import { DriverStatus } from "@/domain/driver/driver.types";
import { AccountStatus, AuthRole } from "@/domain/identity/identity.types";
import { driverRepository, sessionRepository, userRepository } from "@/repositories";
import { driverConnections } from "./driver-connection-registry";
import {
  driverPresenceService,
  type DriverPresenceGateway,
  type RecordActivityResult,
  type RecordLocationResult,
} from "./driver-presence.service";
import { DriverStreamInMessageSchema } from "@/validations/driver-stream.validate";

export type DriverStream = StreamInOut<DriverStreamInMessage, DriverStreamOutMessage>;

/**
 * Janela mínima entre revalidações de elegibilidade na mesma conexão,
 * orientada às mensagens do motorista: nenhum timer independente, nenhuma
 * consulta em conexão ociosa, nunca consultas simultâneas. O objetivo é
 * evitar 4 consultas ao PostgreSQL a cada amostra de GPS (a cada 3 s) —
 * o handshake e as verificações por janela cobrem sessão, conta, papel e
 * aprovação; a entrega sensível revalida na hora (isEligible).
 */
export const DRIVER_STREAM_MIN_REVALIDATION_INTERVAL_MS = 30_000;

/**
 * Idade máxima do último sinal do motorista (mensagem qualquer, inclusive
 * heartbeat) para que a conexão receba entregas sensíveis. Regra aplicada pela
 * camada de entrega (Etapa 5/8) ANTES de `stream.send()` de qualquer conteúdo
 * sensível: uma conexão com heartbeat mais antigo que isto é fechada em vez de
 * receber a entrega — o julgamento é pelo sinal da aplicação, nunca apenas pelo
 * estado da conexão WebSocket (soquete meio aberto não recebe ofertas).
 */
export const DRIVER_STREAM_HEARTBEAT_STALENESS_MS = 60_000;

/** Dependências mínimas para testar o service sem acoplar ao Drizzle/Redis. */
export interface DriverStreamDeps {
  presence: DriverPresenceGateway;
  isSessionActive: (sessionId: string) => Promise<boolean>;
  isAccountActive: (userId: string) => Promise<boolean>;
  hasDriverRole: (userId: string) => Promise<boolean>;
  getDriverStatus: (userId: string) => Promise<DriverStatus | null>;
}

export function isHeartbeatFresh(lastIncomingAt: number, now: number = Date.now()): boolean {
  return now - lastIncomingAt <= DRIVER_STREAM_HEARTBEAT_STALENESS_MS;
}

export class DriverStreamService {
  constructor(private readonly deps: DriverStreamDeps) {}

  /**
   * Ciclo completo de uma conexão: registro em memória, propriedade do estado
   * de presença no Redis, mensagem inicial de teste (Etapa 2) e processamento
   * das mensagens do motorista. A elegibilidade é revalidada orientada às
   * mensagens, com janela mínima de 30 s — o `for await` mantém o handler
   * vivo até a desconexão e as verificações são sequenciais dentro do loop.
   *
   * Cada `heartbeat`/`location.updated` é encaminhado ao DriverPresenceService
   * (Redis, scripts atômicos). Falha do Redis NÃO encerra a conexão e NUNCA
   * confirma gravação em falso: o motorista apenas deixa de ter presença/
   * localização válida até a próxima mensagem — a descoberta é fail-closed.
   */
  async run(stream: DriverStream, authData: AuthData): Promise<void> {
    const userId = authData.userID;
    const connectionId = randomUUID();

    driverConnections.add(userId, stream);

    try {
      try {
        // A conexão mais recente assume a propriedade do estado de presença,
        // atomicamente. A anterior deixa de poder renovar/limpar o estado.
        await this.deps.presence.claimConnection(userId, connectionId);
      } catch (error) {
        this.logRedisFailure(userId, "claim de conexão", error);
      }

      await stream.send({ type: "stream.connected", connectedAt: new Date().toISOString() });

      // O handshake acabou de validar sessão, conta, papel e aprovação
      // (AuthHandler + middlewares); a janela de revalidação começa agora.
      let lastEligibilityCheckAt = Date.now();
      let lastRedisFailureLoggedAt = 0;

      for await (const raw of stream) {
        const parsed = DriverStreamInMessageSchema.safeParse(raw);
        if (!parsed.success) {
          // Violação de protocolo encerra a conexão (fail fast): o servidor
          // nunca silenciosamente ignora mensagens inválidas de telemetria.
          // O fechamento é explícito — a rejeição do handler não fecha o
          // WebSocket no runtime do Encore.
          log.warn("Mensagem inválida no stream do motorista; encerrando conexão.", {
            userId,
            issues: parsed.error.issues.map(issue => issue.path.join(".")),
          });
          await stream.close();
          return;
        }

        if (Date.now() - lastEligibilityCheckAt >= DRIVER_STREAM_MIN_REVALIDATION_INTERVAL_MS) {
          lastEligibilityCheckAt = Date.now();
          if (!(await this.isEligible(authData))) {
            log.warn("Elegibilidade do stream deixou de valer; encerrando conexão.", { userId });
            await stream.close();
            return;
          }
        }

        const message = parsed.data;
        switch (message.type) {
          case "location.updated": {
            // Ordenação/anti-sobrescrita/propriedade: atômicas no Redis (Lua).
            // `superseded`/`absent` = esta conexão perdeu (ou nunca teve) a
            // propriedade do estado — encerrar força a reconexão controlada
            // com novo claim. `stale`/`future`/`invalid` = amostra ignorada,
            // conexão continua. Nada é confirmado em falso.
            let result: RecordLocationResult;
            try {
              result = await this.deps.presence.recordLocation(userId, connectionId, {
                latitude: message.latitude,
                longitude: message.longitude,
                sampledAtMs: Date.parse(message.sampledAt),
                accuracyMeters: message.accuracyMeters,
              });
            } catch (error) {
              lastRedisFailureLoggedAt = this.logRedisFailure(
                userId,
                "gravação de localização",
                error,
                lastRedisFailureLoggedAt,
              );
              break;
            }

            if (result === "superseded" || result === "absent") {
              log.warn(
                result === "superseded"
                  ? "Conexão de motorista substituída por outra mais recente; encerrando."
                  : "Estado de presença expirado; encerrando conexão para re-claim na reconexão.",
                { userId, result },
              );
              await stream.close();
              return;
            }

            if (result !== "accepted") {
              log.debug("Amostra de localização ignorada.", { userId, result });
            }
            break;
          }
          case "heartbeat": {
            let activity: RecordActivityResult;
            try {
              activity = await this.deps.presence.recordActivity(userId, connectionId);
            } catch (error) {
              lastRedisFailureLoggedAt = this.logRedisFailure(
                userId,
                "renovação de presença",
                error,
                lastRedisFailureLoggedAt,
              );
              break;
            }

            if (activity === "superseded" || activity === "absent") {
              log.warn(
                activity === "superseded"
                  ? "Conexão de motorista substituída por outra mais recente; encerrando."
                  : "Estado de presença expirado; encerrando conexão para re-claim na reconexão.",
                { userId, result: activity },
              );
              await stream.close();
              return;
            }
            break;
          }
        }
      }
    } finally {
      // Limpeza da conexão que encerra: libera o estado Redis SOMENTE se esta
      // conexão ainda for a dona (conexão antiga não apaga a nova) e remove o
      // registro local. Falha do Redis aqui é coberta pelo TTL de presença.
      try {
        await this.deps.presence.releaseConnection(userId, connectionId);
      } catch (error) {
        log.warn("Falha ao liberar estado de presença na desconexão.", {
          userId,
          errorName: error instanceof Error ? error.name : "unknown",
        });
      }
      driverConnections.remove(userId, stream);
    }
  }

  /** Log de falha do Redis com throttle por conexão (GPS chega a cada poucos s). */
  private logRedisFailure(userId: string, operation: string, error: unknown, lastLoggedAt = 0): number {
    const now = Date.now();
    if (now - lastLoggedAt < 30_000) return lastLoggedAt;
    log.warn(`Redis indisponível para ${operation}; presença/localização ficam sem atualização.`, {
      userId,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return now;
  }

  /**
   * Elegibilidade completa na fonte de verdade, em cadeia sequencial (sem
   * consultas simultâneas): sessão ativa → conta ativa → papel DRIVER →
   * perfil APPROVED. Falha aberta: qualquer erro de banco encerra como
   * inelegível — indisponibilidade nunca mantém acesso.
   *
   * Contrato de entrega: a camada de entrega (Etapa 5/8) DEVE chamar este
   * método imediatamente antes de qualquer `stream.send()` sensível (ex.:
   * oferta), além do gate de frescor de `isHeartbeatFresh`. Conexão aberta
   * não é prova de elegibilidade.
   */
  async isEligible(authData: AuthData): Promise<boolean> {
    try {
      if (!(await this.deps.isSessionActive(authData.sessionId))) return false;
      if (!(await this.deps.isAccountActive(authData.userID))) return false;
      if (!(await this.deps.hasDriverRole(authData.userID))) return false;
      return (await this.deps.getDriverStatus(authData.userID)) === DriverStatus.APPROVED;
    } catch {
      log.error("Falha ao revalidar elegibilidade do stream.", { userId: authData.userID });
      return false;
    }
  }
}

export const driverStreamService = new DriverStreamService({
  presence: driverPresenceService,
  isSessionActive: async sessionId => (await sessionRepository.findActiveById(sessionId)) !== null,
  isAccountActive: async userId => (await userRepository.findAuthStateById(userId))?.status === AccountStatus.ACTIVE,
  hasDriverRole: async userId => (await userRepository.findRolesByUserId(userId)).includes(AuthRole.Driver),
  getDriverStatus: userId => driverRepository.findStatusByUserId(userId),
});
