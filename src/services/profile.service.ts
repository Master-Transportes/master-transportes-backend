import { APIError } from "encore.dev/api";
import { hash, compare } from "bcrypt";
import { validateOrThrow } from "@/validations/schema-validator";
import { UpdateProfileSchema, ChangePasswordSchema } from "@/validations/dto/client.validate";
import type { IClientRepository, ClientRow } from "@/repositories/contracts/IClientRepository";
import type { IClientCache } from "@/cache/contracts/IClientCache";
import type { ISessionStore } from "@/cache/contracts/ISessionStore";
import type { ClientProfileResponse, UpdateProfileDTO, ChangePasswordDTO } from "@/dto/client.interface";
import { clientRepository } from "@/repositories";
import { clientCache, sessionStore } from "@/cache";
import { isPgUniqueViolation } from "@/utils/database";

function toProfile(client: ClientRow): ClientProfileResponse {
  return {
    id: client.id,
    fullName: client.fullName,
    email: client.email,
    role: client.role,
    status: client.status,
  };
}

export class ProfileService {
  constructor(
    private readonly clientRepo: IClientRepository,
    private readonly clientCacheService: IClientCache,
    private readonly sessionStore_: ISessionStore,
  ) {}

  async getProfile(userID: string): Promise<ClientProfileResponse> {
    const cached = await this.clientCacheService.getProfile<ClientProfileResponse>(userID);
    if (cached) return cached;

    const user = await this.clientRepo.findById(userID);
    if (!user) {
      throw APIError.notFound("Usuário não encontrado.");
    }

    const profile = toProfile(user);
    await this.clientCacheService.setProfile(userID, profile as unknown as Record<string, unknown>);
    return profile;
  }

  async updateProfile(userID: string, payload: UpdateProfileDTO): Promise<ClientProfileResponse> {
    const validated = validateOrThrow(UpdateProfileSchema, payload);

    try {
      const user = await this.clientRepo.update(userID, {
        fullName: validated.fullName,
        email: validated.email?.toLowerCase(),
        updatedAt: new Date(),
      });

      if (!user) {
        throw APIError.notFound("Usuário não encontrado.");
      }

      await this.clientCacheService.invalidate(userID);

      return toProfile(user);
    } catch (error: unknown) {
      if (isPgUniqueViolation(error)) {
        throw APIError.invalidArgument("E-mail já está em uso.");
      }
      throw error;
    }
  }

  async changePassword(userID: string, payload: ChangePasswordDTO): Promise<void> {
    const validated = validateOrThrow(ChangePasswordSchema, payload);

    const user = await this.clientRepo.findPasswordById(userID);
    if (!user) {
      throw APIError.notFound("Usuário não encontrado.");
    }

    const currentValid = await compare(validated.currentPassword, user.password);
    if (!currentValid) {
      throw APIError.permissionDenied("Senha atual incorreta.");
    }

    const hashedPassword = await hash(validated.newPassword, 10);
    await this.clientRepo.updatePassword(userID, hashedPassword);

    await Promise.all([this.clientCacheService.invalidate(userID), this.sessionStore_.revokeAll(userID)]);
  }
}

export const profileService = new ProfileService(clientRepository, clientCache, sessionStore);
