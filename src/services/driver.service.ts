import { APIError } from "encore.dev/api";
import { ErrorReason } from "@/constants/error-reasons";
import { normalizeEmail, normalizeFullName } from "@/domain/identity/identity.utils";
import { hashPassword } from "@/auth/password";
import type {
  DriverApplyRequest,
  DriverAvailabilityRequest,
  DriverAvailabilityResponse,
  DriverMeResponse,
  DriverRegisterRequest,
  DriverRegisterResponse,
} from "@/dto/driver.dto";
import { toDriverMeResponse, toDriverRegisterResponse } from "@/mappers/driver.mapper";
import { driverRepository } from "@/repositories";
import type { DriverRepository } from "@/repositories/driver/driver.repository";
import { validateOrThrow } from "@/validations/schema-validator";
import { DriverApplySchema, DriverAvailabilitySchema, DriverRegisterSchema } from "@/validations/driver.validate";
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

  /**
   * Ativa/desativa a disponibilidade operacional. O papel DRIVER já foi exigido
   * pelo middleware `driver-role` e a aprovação pelo `driver-operational`; o
   * service revalida a aprovação no banco para fechar a janela entre o guard e
   * a gravação (ex.: suspensão concorrente).
   */
  async setAvailability(userId: string, request: DriverAvailabilityRequest): Promise<DriverAvailabilityResponse> {
    const data = validateOrThrow(DriverAvailabilitySchema, request);

    try {
      const result = await this.driverRepository.setAvailability(userId, data.available);

      switch (result.status) {
        case "updated":
          return result.availability;
        case "profile_not_found":
          throw APIError.notFound("Perfil de motorista não encontrado.").withDetails({
            reason: ErrorReason.DRIVER_PROFILE_NOT_FOUND,
          });
        case "not_approved":
          throw APIError.permissionDenied("Motorista não aprovado para entrar em operação.").withDetails({
            reason: ErrorReason.DRIVER_PROFILE_UNAVAILABLE,
          });
        case "active_ride_conflict":
          // O aceite de corrida desativa a disponibilidade (contrato do MVP);
          // reativar manualmente durante a corrida é conflito explícito.
          throw APIError.alreadyExists("Não é possível receber ofertas durante uma corrida ativa.").withDetails({
            reason: ErrorReason.DRIVER_ALREADY_ON_RIDE,
          });
      }
    } catch (error) {
      translatePersistenceError(error, { fallbackInternal: "Não foi possível atualizar a disponibilidade." });
    }
  }

  /** Estado operacional do próprio motorista. Acesso a motorista sem aprovação permanece. */
  async getAvailability(userId: string): Promise<DriverAvailabilityResponse> {
    try {
      const record = await this.driverRepository.findAvailabilityByUserId(userId);
      if (!record) {
        throw APIError.notFound("Perfil de motorista não encontrado.").withDetails({
          reason: ErrorReason.DRIVER_PROFILE_NOT_FOUND,
        });
      }
      return record;
    } catch (error) {
      translatePersistenceError(error, { fallbackInternal: "Não foi possível carregar a disponibilidade." });
    }
  }
}

export const driverService = new DriverService(driverRepository);
