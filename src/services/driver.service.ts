import { APIError } from "encore.dev/api";
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
    const passwordHash = await hashPassword(data.password);

    try {
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
        email: "E-mail já está em uso.",
        cpf: "CPF já está em uso.",
        fallbackInternal: "Não foi possível concluir o cadastro de motorista.",
      });
    }
  }

  async getMe(userId: string): Promise<DriverMeResponse> {
    try {
      const profile = await this.driverRepository.findProfileByUserId(userId);
      if (!profile) {
        throw APIError.notFound("Perfil de motorista não encontrado.");
      }
      return toDriverMeResponse(profile);
    } catch (error) {
      translatePersistenceError(error, { fallbackInternal: "Não foi possível carregar o perfil." });
    }
  }
}

export const driverService = new DriverService(driverRepository);
