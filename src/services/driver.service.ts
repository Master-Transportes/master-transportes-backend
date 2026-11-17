import { APIError } from "encore.dev/api";
import { ErrorReason } from "@/constants/error-reasons";
import { normalizeEmail, normalizeFullName } from "@/domain/identity/identity.utils";
import { hashPassword } from "@/auth/password";
import type { DriverMeResponse, DriverRegisterRequest, DriverRegisterResponse } from "@/dto/driver.dto";
import { toDriverMeResponse, toDriverRegisterResponse } from "@/mappers/driver.mapper";
import { driverRepository } from "@/repositories";
import type { DriverRepository } from "@/repositories/driver/driver.repository";
import { validateOrThrow } from "@/validations/schema-validator";
import { DriverRegisterSchema } from "@/validations/driver.validate";
import { translatePersistenceError } from "./service-errors";

export class DriverService {
  constructor(private readonly driverRepository: DriverRepository) {}

  async register(request: DriverRegisterRequest): Promise<DriverRegisterResponse> {
    const data = validateOrThrow(DriverRegisterSchema, request);

    try {
      const passwordHash = await hashPassword(data.password);
      const profile = await this.driverRepository.createDriverAccount({
        fullName: normalizeFullName(data.fullName),
        email: normalizeEmail(data.email),
        passwordHash,
        phone: data.phone,
        cpf: data.cpf,
      });

      return toDriverRegisterResponse(profile);
    } catch (error) {
      translatePersistenceError(error, {
        conflictMessage: "Não foi possível concluir o cadastro.",
        conflictReason: ErrorReason.ACCOUNT_ALREADY_EXISTS,
        fallbackInternal: "Não foi possível concluir o cadastro de motorista.",
      });
    }
  }

  async getMe(userId: string): Promise<DriverMeResponse> {
    try {
      const profile = await this.driverRepository.findProfileByUserId(userId);
      if (!profile) {
        throw APIError.notFound("Perfil de motorista não encontrado.").withDetails({
          reason: ErrorReason.DRIVER_PROFILE_NOT_FOUND,
        });
      }
      return toDriverMeResponse(profile);
    } catch (error) {
      translatePersistenceError(error, { fallbackInternal: "Não foi possível carregar o perfil." });
    }
  }
}

export const driverService = new DriverService(driverRepository);
