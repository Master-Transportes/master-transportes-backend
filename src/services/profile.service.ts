import { APIError } from "encore.dev/api";
import { hash, compare } from "bcrypt";
import { validateOrThrow } from "@/validations/schema-validator";
import type { IUserRepository, UserRow } from "@/infra/postgres/contracts/IUserRepository";
import type { IUserCache } from "@/infra/redis/contracts/IUserCache";
import type { UserProfileResponse, UpdateProfileDTO, ChangePasswordDTO } from "@/dto/user.interface";
import { userRepository } from "@/infra/postgres";
import { userCache } from "@/infra/redis";
import { isPgUniqueViolation } from "@/constants/database";
import type { ZodObject, ZodRawShape } from "zod";

function toProfile(user: UserRow): UserProfileResponse {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    status: user.status,
  };
}

export class ProfileService {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly userCacheService: IUserCache,
  ) {}

  async getProfile(userID: string): Promise<UserProfileResponse> {
    const user = await this.userRepo.findById(userID);
    if (!user) {
      throw APIError.notFound("Usuário não encontrado.");
    }
    return toProfile(user);
  }

  async updateProfile(
    userID: string,
    payload: UpdateProfileDTO,
    schema: ZodObject<ZodRawShape>,
  ): Promise<UserProfileResponse> {
    const validated = validateOrThrow(schema, payload as unknown as Record<string, unknown>) as { fullName: string; email?: string };

    try {
      const user = await this.userRepo.update(userID, {
        fullName: validated.fullName,
        email: validated.email?.toLowerCase(),
        updatedAt: new Date(),
      });

      if (!user) {
        throw APIError.notFound("Usuário não encontrado.");
      }

      await this.userCacheService.invalidate(userID);

      return toProfile(user);
    } catch (error: unknown) {
      if (isPgUniqueViolation(error)) {
        throw APIError.invalidArgument("E-mail já está em uso.");
      }
      throw error;
    }
  }

  async changePassword(
    userID: string,
    payload: ChangePasswordDTO,
    schema: ZodObject<ZodRawShape>,
  ): Promise<void> {
    const validated = validateOrThrow(schema, payload as unknown as Record<string, unknown>) as { currentPassword: string; newPassword: string };

    const user = await this.userRepo.findPasswordById(userID);
    if (!user) {
      throw APIError.notFound("Usuário não encontrado.");
    }

    const currentValid = await compare(validated.currentPassword, user.password);
    if (!currentValid) {
      throw APIError.permissionDenied("Senha atual incorreta.");
    }

    const hashedPassword = await hash(validated.newPassword, 10);
    await this.userRepo.updatePassword(userID, hashedPassword);

    await this.userCacheService.invalidate(userID);
  }
}

export const profileService = new ProfileService(userRepository, userCache);
