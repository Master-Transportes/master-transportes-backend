import { APIError } from "encore.dev/api";
import { ErrorReason } from "@/constants/error-reasons";
import { normalizeEmail, normalizeFullName } from "@/domain/identity/identity.utils";
import { hashPassword } from "@/auth/password";
import type {
  DriverApplyRequest,
  DriverMeResponse,
  DriverRegisterRequest,
  DriverRegisterResponse,
} from "@/dto/driver.dto";
import { toDriverMeResponse, toDriverRegisterResponse } from "@/mappers/driver.mapper";
import { driverRepository } from "@/repositories";
import type { DriverRepository } from "@/repositories/driver/driver.repository";
import { validateOrThrow } from "@/validations/schema-validator";
import { DriverApplySchema, DriverRegisterSchema } from "@/validations/driver.validate";
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

  /**
   * Adiciona o papel DRIVER a uma identidade CLIENT existente.
   * A identidade vem do AuthData; o payload só traz telefone/CPF.
   */
  async apply(userId: string, request: DriverApplyRequest): Promise<DriverMeResponse> {
    const data = validateOrThrow(DriverApplySchema, request);

    try {
      const result = await this.driverRepository.applyDriverRole({ userId, phone: data.phone, cpf: data.cpf });

      switch (result.status) {
        case "created":
          return toDriverMeResponse(result.profile);
        case "user_not_found":
          throw APIError.notFound("Usuário não encontrado.").withDetails({ reason: ErrorReason.PROFILE_NOT_FOUND });
        case "already_driver":
        case "profile_conflict":
          throw APIError.alreadyExists("Conta já possui perfil de motorista.").withDetails({
            reason: ErrorReason.DRIVER_PROFILE_ALREADY_EXISTS,
          });
        case "identity_conflict":
          throw APIError.alreadyExists("Telefone ou CPF divergem dos dados da conta.").withDetails({
            reason: ErrorReason.RESOURCE_CONFLICT,
          });
      }
    } catch (error) {
      translatePersistenceError(error, {
        conflictMessage: "Não foi possível aplicar o papel de motorista.",
        conflictReason: ErrorReason.ACCOUNT_ALREADY_EXISTS,
        fallbackInternal: "Não foi possível aplicar o papel de motorista.",
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
