/**
 * Contratos do stream bidirecional do motorista (`/driver/stream`).
 *
 * Uma única conexão transporta tipos diferentes de mensagem nas duas direções.
 * Regras da Etapa 2 do MVP (docs/roadmap/mvp-tempo-real.md):
 *  - o stream NUNCA decide atribuição de corrida: isso é transação REST;
 *  - o servidor não confia cegamente no relógio do telefone (`sampledAt` é
 *    referência; o instante de recebimento é medido no servidor);
 *  - mensagem INVÁLIDA (shape reconhecido, semântica fora das regras) encerra
 *    a conexão (fail fast); mensagem com `type` DESCONHECIDO é DESCARTADA
 *    pelo runtime do Encore, silenciosamente, mantendo a conexão.
 *
 * Restrição do Encore: o genérico de `api.streamInOut` precisa ser UMA
 * interface declarada (alias de união não é aceito pelo parser). Por isso os
 * tipos de fio abaixo descrevem o superset dos campos com discriminador
 * `type`; a validação precisa por mensagem vive em
 * `src/validations/driver-stream.validate.ts` (união discriminada) e o service
 * consome apenas o resultado validado.
 *
 * Comportamento verificado em runtime (Encore 1.58.4, verificado em
 * 2026-11-17 — docs/roadmap/mvp-tempo-real.md, Etapa 2):
 *  - mensagem com `type` fora do schema de fio é DESCARTADA pelo runtime
 *    (silenciosa; a conexão persiste);
 *  - campos desconhecidos são REMOVIDOS na desserialização de fio;
 *  - mensagens com shape de fio válido mas semântica inválida (coordenada
 *    fora de faixa, `sampledAt` fora da janela, precisão negativa) chegam ao
 *    Zod e encerram a conexão via `stream.close()` (fail fast no service);
 *  - motoristas inelegíveis completam o handshake HTTP mas o middleware
 *    operacional impede o handler: NENHUMA mensagem é entregue. O cliente
 *    deve tratar a ausência de `stream.connected` como recusa de acesso.
 */

export type DriverStreamInMessageType = "location.updated" | "heartbeat";
export type DriverStreamOutMessageType = "stream.connected";

/** Mensagens enviadas pelo aplicativo do motorista (tipo de fio). */
export interface DriverStreamInMessage {
  type: DriverStreamInMessageType;
  /** Presente quando type = "location.updated". Latitude em graus (-90..90). */
  latitude?: number;
  /** Presente quando type = "location.updated". Longitude em graus (-180..180). */
  longitude?: number;
  /** Precisão da posição em metros, quando o dispositivo informa. */
  accuracyMeters?: number;
  /** Instante da amostra no dispositivo, ISO 8601 UTC. */
  sampledAt?: string;
}

/** Mensagens enviadas pelo servidor ao motorista (tipo de fio). */
export interface DriverStreamOutMessage {
  type: DriverStreamOutMessageType;
  /** Instante de aceitação da conexão, ISO 8601 UTC (relógio do servidor). */
  connectedAt?: string;
}

/** Mensagem `location.updated` validada (uso interno pós-validação). */
export interface ValidatedDriverLocationMessage {
  type: "location.updated";
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  sampledAt: string;
}

/** Mensagem `heartbeat` validada (uso interno pós-validação). */
export interface ValidatedDriverHeartbeatMessage {
  type: "heartbeat";
}

/** União precisa das mensagens de entrada após validação (uso interno). */
export type ValidatedDriverStreamInMessage = ValidatedDriverLocationMessage | ValidatedDriverHeartbeatMessage;
