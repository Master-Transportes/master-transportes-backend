import { api } from "encore.dev/api";
import * as auth from "~encore/auth";
import { driverService } from "@/services/driver.service";
import type { DriverApplyRequest, DriverMeResponse } from "@/dto/driver.dto";

/**
 * Aplicação de papel DRIVER para uma identidade CLIENT autenticada.
 *
 * O endpoint vive no serviço `client` para reutilizar o `ClientRoleMiddleware`;
 * o path é o contrato público. A identidade vem do AuthData — nunca do payload.
 */
export const applyDriver = api<DriverApplyRequest, DriverMeResponse>(
  { expose: true, method: "POST", path: "/driver/apply", auth: true, sensitive: true, tags: ["client-role"] },
  async payload => {
    const { userID } = auth.getAuthData()!;
    return driverService.apply(userID, payload);
  },
);
