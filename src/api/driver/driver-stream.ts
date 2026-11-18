import { api } from "encore.dev/api";
import * as auth from "~encore/auth";
import { driverStreamService } from "@/services/driver-stream.service";
import type { DriverStreamInMessage, DriverStreamOutMessage } from "@/dto/driver-stream.dto";

/**
 * Stream bidirecional do motorista (Etapa 2 do MVP): recebe localização e
 * heartbeat do aplicativo, envia ofertas e eventos do servidor pela mesma
 * conexão. O stream comunica; não decide — atribuição de corrida é REST.
 *
 * Operação operacional: exige papel DRIVER (`driver-role`) E aprovação
 * cadastral (`driver-operational`) no handshake, com revalidação orientada
 * às mensagens (janela mínima de 30 s, sem timer) durante a vida da conexão.
 */
export const stream = api.streamInOut<DriverStreamInMessage, DriverStreamOutMessage>(
  { path: "/driver/stream", expose: true, auth: true, sensitive: true, tags: ["driver-role", "driver-operational"] },
  async stream => {
    const authData = auth.getAuthData()!;
    return driverStreamService.run(stream, authData);
  },
);
