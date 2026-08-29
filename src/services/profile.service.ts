import { APIError } from "encore.dev/api";
import { hash, compare } from "bcrypt";
import { validateOrThrow } from "@/validations/schema-validator";
import { UpdateProfileSchema, ChangePasswordSchema } from "@/validations/dto/user.validate";
import type { IUserRepository, UserRow } from "@/repositories/contracts/IUserRepository";
import type { IUserCache } from "@/cache/contracts/IUserCache";
import type { UserProfileResponse, UpdateProfileDTO, ChangePasswordDTO } from "@/dto/user.interface";
import { userRepository } from "@/repositories";
import { userCache } from "@/cache";
import { isPgUniqueViolation } from "@/utils/database";

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

  async updateProfile(userID: string, payload: UpdateProfileDTO): Promise<UserProfileResponse> {
    const validated = validateOrThrow(UpdateProfileSchema, payload);

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

  async changePassword(userID: string, payload: ChangePasswordDTO): Promise<void> {
    const validated = validateOrThrow(ChangePasswordSchema, payload);

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
