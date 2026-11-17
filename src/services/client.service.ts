import { APIError } from "encore.dev/api";
import { ErrorReason } from "@/constants/error-reasons";
import { normalizeEmail, normalizeFullName } from "@/domain/identity/identity.utils";
import { hashPassword } from "@/auth/password";
import type { ClientMeResponse, ClientRegisterRequest, ClientRegisterResponse } from "@/dto/client.dto";
import { toClientMeResponse, toClientRegisterResponse } from "@/mappers/client.mapper";
import { userRepository } from "@/repositories";
import type { UserRepository } from "@/repositories/user/user.repository";
import { validateOrThrow } from "@/validations/schema-validator";
import { ClientRegisterSchema } from "@/validations/client.validate";
import { translatePersistenceError } from "./service-errors";

export class ClientService {
  constructor(private readonly userRepository: UserRepository) {}

  async register(request: ClientRegisterRequest): Promise<ClientRegisterResponse> {
    const data = validateOrThrow(ClientRegisterSchema, request);

    try {
      const passwordHash = await hashPassword(data.password);
      const profile = await this.userRepository.createClientAccount({
        fullName: normalizeFullName(data.fullName),
        email: normalizeEmail(data.email),
        passwordHash,
        phone: data.phone,
        cpf: data.cpf,
      });

      return toClientRegisterResponse(profile);
    } catch (error) {
      translatePersistenceError(error, {
        conflictMessage: "Não foi possível concluir o cadastro.",
        conflictReason: ErrorReason.ACCOUNT_ALREADY_EXISTS,
        fallbackInternal: "Não foi possível concluir o cadastro.",
      });
    }
  }

  async getMe(userId: string): Promise<ClientMeResponse> {
    try {
      const profile = await this.userRepository.findProfileById(userId);
      if (!profile) {
        throw APIError.notFound("Usuário não encontrado.").withDetails({ reason: ErrorReason.PROFILE_NOT_FOUND });
      }
      return toClientMeResponse(profile);
    } catch (error) {
      translatePersistenceError(error, { fallbackInternal: "Não foi possível carregar o perfil." });
    }
  }
}

export const clientService = new ClientService(userRepository);
