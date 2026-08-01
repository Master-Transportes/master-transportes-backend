import { APIError } from "encore.dev/api";
import type {
  BanUserParams,
  ListUsersParams,
  ListSystemUsersParams,
  PaginatedUsersResponse,
  DashboardActionResponse,
} from "@/dto/dashboard.interface";
import { validateOrThrow } from "@/validations/schema-validator";
import { BanUserSchema, ListUsersSchema, ListSystemUsersSchema } from "@/validations/dto/dashboard.validate";
import type {
  IUserAdminRepository,
  ListUsersData,
  ListSystemUsersData,
} from "@/infra/drizzle/contracts/IUserAdminRepository";
import type { IUserCache } from "@/infra/redis/contracts/IUserCache";
import { userAdminRepository } from "@/infra/drizzle";
import { userCache } from "@/infra/redis";

export class DashboardService {
  constructor(
    private readonly userAdminRepo: IUserAdminRepository,
    private readonly userCacheService: IUserCache,
  ) {}

  async listUsers(params: ListUsersParams): Promise<PaginatedUsersResponse> {
    const data: ListUsersData = validateOrThrow(ListUsersSchema, params);
    return this.userAdminRepo.listUsers(data);
  }

  async listSystemUsers(params: ListSystemUsersParams): Promise<PaginatedUsersResponse> {
    const data: ListSystemUsersData = validateOrThrow(ListSystemUsersSchema, params);
    return this.userAdminRepo.listSystemUsers(data);
  }

  async activateUser(userId: string): Promise<DashboardActionResponse> {
    const result = await this.userAdminRepo.activateUser(userId);
    if (!result) {
      throw APIError.notFound("Usuário não encontrado.");
    }
    await this.userCacheService.invalidate(userId);
    return result;
  }

  async banUser(payload: BanUserParams): Promise<DashboardActionResponse> {
    const { reason } = validateOrThrow(BanUserSchema, payload);
    const result = await this.userAdminRepo.banUser(payload.id, reason);
    if (!result) {
      throw APIError.notFound("Usuário não encontrado.");
    }
    await this.userCacheService.invalidate(payload.id);
    return result;
  }
}

export const dashboardService = new DashboardService(userAdminRepository, userCache);
