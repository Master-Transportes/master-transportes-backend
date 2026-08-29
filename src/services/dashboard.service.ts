import { APIError } from "encore.dev/api";
import type {
  BanUserParams,
  ListUsersParams,
  ListSystemUsersParams,
  PaginatedUsersResponse,
  DashboardActionResponse,
  DashboardUserItem,
} from "@/dto/dashboard.interface";
import { validateOrThrow } from "@/validations/schema-validator";
import { BanUserSchema, ListUsersSchema, ListSystemUsersSchema } from "@/validations/dto/dashboard.validate";
import type {
  IUserAdminRepository,
  ListUsersData,
  ListSystemUsersData,
} from "@/repositories/contracts/IUserAdminRepository";
import type { IUserCache } from "@/cache/contracts/IUserCache";
import { userAdminRepository } from "@/repositories";
import { userCache } from "@/cache";

function toDashboardUserItem(row: { id: string; fullName: string; email: string; role: string; status: string; banReason: string | null; createdAt: Date; updatedAt: Date }): DashboardUserItem {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    role: row.role as DashboardUserItem["role"],
    status: row.status as DashboardUserItem["status"],
    banReason: row.banReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPaginatedResponse(result: { users: { id: string; fullName: string; email: string; role: string; status: string; banReason: string | null; createdAt: Date; updatedAt: Date }[]; total: number; page: number; limit: number; totalPages: number }): PaginatedUsersResponse {
  return {
    users: result.users.map(toDashboardUserItem),
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
  };
}

function toDashboardAction(result: { id: string; status: string; banReason: string | null }): DashboardActionResponse {
  return {
    id: result.id,
    status: result.status as DashboardActionResponse["status"],
    banReason: result.banReason,
  };
}

export class DashboardService {
  constructor(
    private readonly userAdminRepo: IUserAdminRepository,
    private readonly userCacheService: IUserCache,
  ) {}

  async listUsers(params: ListUsersParams): Promise<PaginatedUsersResponse> {
    const data: ListUsersData = validateOrThrow(ListUsersSchema, params);
    const result = await this.userAdminRepo.listUsers(data);
    return toPaginatedResponse(result);
  }

  async listSystemUsers(params: ListSystemUsersParams): Promise<PaginatedUsersResponse> {
    const data: ListSystemUsersData = validateOrThrow(ListSystemUsersSchema, params);
    const result = await this.userAdminRepo.listSystemUsers(data);
    return toPaginatedResponse(result);
  }

  async activateUser(userId: string): Promise<DashboardActionResponse> {
    const result = await this.userAdminRepo.activateUser(userId);
    if (!result) {
      throw APIError.notFound("Usuário não encontrado.");
    }
    await this.userCacheService.invalidate(userId);
    return toDashboardAction(result);
  }

  async banUser(payload: BanUserParams): Promise<DashboardActionResponse> {
    const { reason } = validateOrThrow(BanUserSchema, payload);
    const result = await this.userAdminRepo.banUser(payload.id, reason);
    if (!result) {
      throw APIError.notFound("Usuário não encontrado.");
    }
    await this.userCacheService.invalidate(payload.id);
    return toDashboardAction(result);
  }
}

export const dashboardService = new DashboardService(userAdminRepository, userCache);
