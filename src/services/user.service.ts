import { APIError } from "encore.dev/api";
import { hash, compare } from "bcrypt";
import { validateOrThrow } from "@/validations/schema-validator";
import { ChangePasswordSchema, RegisterUserSchema, UpdateProfileSchema } from "@/validations/dto/user.validate";
import type { ChangePasswordDTO, RegisterUserDTO, UpdateProfileDTO, UserProfileResponse, RideSummary } from "@/dto/user.interface";
import type { IUserRepository } from "@/contracts/IUserRepository";
import type { IRideRepository } from "@/contracts/IRideRepository";
import type { IUserCache } from "@/contracts/IUserCache";
import { userRepository } from "@/repositories/user.repository";
import { rideRepository } from "@/repositories/ride.repository";
import { userCache } from "@/infra/cache/user-cache";

const DUPLICATE_KEY = "23505";

export class UserService {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly rideRepo: IRideRepository,
    private readonly userCacheService: IUserCache,
  ) {}

  async register(payload: RegisterUserDTO): Promise<{ id: string }> {
    const validated = validateOrThrow(RegisterUserSchema, payload);

    const hashedPassword = await hash(validated.password, 10);
    try {
      return await this.userRepo.create({
        fullName: validated.fullName,
        email: validated.email.toLowerCase(),
        password: hashedPassword,
        role: "CLIENT",
      });
    } catch (error: unknown) {
      const err = error as { cause?: { code?: string }; code?: string };
      const pgCode = err.cause?.code ?? err.code;
      if (pgCode === DUPLICATE_KEY) {
        throw APIError.invalidArgument("E-mail já está em uso.");
      }
      throw error;
    }
  }

  async getProfile(userID: string): Promise<UserProfileResponse> {
    const user = await this.userRepo.findById(userID);
    if (!user) {
      throw APIError.notFound("Usuário não encontrado.");
    }
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      status: user.status,
    };
  }

  async getRides(userID: string): Promise<{ rides: RideSummary[] }> {
    const result = await this.rideRepo.findByClientId(userID);
    return { rides: result };
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

      return {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        status: user.status,
      };
    } catch (error: unknown) {
      const err = error as { cause?: { code?: string }; code?: string };
      if (err.cause?.code === DUPLICATE_KEY || err.code === DUPLICATE_KEY) {
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

export const userService = new UserService(userRepository, rideRepository, userCache);
