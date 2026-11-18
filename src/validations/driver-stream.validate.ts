import { z } from "zod";
import type { ValidatedDriverStreamInMessage } from "@/dto/driver-stream.dto";

/**
 * Tolerância de `sampledAt` NO FUTURO, única para todas as camadas (Zod,
 * DriverPresenceService e scripts Lua). Amostras mais futuras que isto são
 * rejeitadas — uma coordenada "do futuro" jamais pode congelar a ordenação
 * ou passar como recente na descoberta. A tolerância para o PASSADO continua
 * sendo a janela de protocolo abaixo (±10 min), pois amostras atrasadas são
 * comuns; a elegibilidade de matching tem janela própria e muito menor.
 */
export const DRIVER_SAMPLE_FUTURE_TOLERANCE_MS = 10_000;

/** Janela de protocolo para amostras no passado (sanidade, não matching). */
export const DRIVER_SAMPLE_PAST_TOLERANCE_MS = 10 * 60 * 1000;

/**
 * Validação das mensagens do stream do motorista.
 *
 * Camadas reais (verificadas em runtime — ver src/dto/driver-stream.dto.ts):
 *  - o runtime do Encore descarta `type` desconhecido e remove campos extras
 *    antes da entrega (schema de fio);
 *  - este Zod revalida a semântica (coordenadas, precisão, janela de
 *    `sampledAt`) e é a fronteira que encerra a conexão em violação;
 *  - `strictObject` permanece como defesa em profundidade: uma versão futura
 *    do runtime pode passar campos extras adiante.
 */
const coordinateBounds = { message: "Coordenada fora dos limites válidos." } as const;

export const DriverLocationMessageSchema = z.strictObject({
  type: z.literal("location.updated"),
  latitude: z.number(coordinateBounds).finite().min(-90).max(90),
  longitude: z.number(coordinateBounds).finite().min(-180).max(180),
  accuracyMeters: z.number().positive("Precisão deve ser positiva.").max(100_000).optional(),
  sampledAt: z
    .string()
    .datetime({ offset: true, message: "sampledAt deve ser um instante ISO 8601 com fuso." })
    .refine(
      value => {
        const instant = new Date(value).getTime();
        // Não confiamos no relógio do telefone: passado dentro da janela de
        // protocolo e futuro dentro da tolerância única (amostra "do futuro"
        // jamais pode congelar a ordenação no Redis).
        const skewMs = instant - Date.now();
        return (
          Number.isFinite(instant) &&
          skewMs <= DRIVER_SAMPLE_FUTURE_TOLERANCE_MS &&
          skewMs >= -DRIVER_SAMPLE_PAST_TOLERANCE_MS
        );
      },
      { message: "sampledAt está fora da janela tolerada em relação ao relógio do servidor." },
    ),
});

export const DriverHeartbeatMessageSchema = z.strictObject({ type: z.literal("heartbeat") });

/**
 * União discriminada das mensagens de entrada. O payload cru é o tipo de fio
 * (`DriverStreamInMessage`); o resultado validado é a união precisa.
 */
export const DriverStreamInMessageSchema = z.discriminatedUnion("type", [
  DriverLocationMessageSchema,
  DriverHeartbeatMessageSchema,
]) satisfies z.ZodType<ValidatedDriverStreamInMessage>;
