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
  IClientAdminRepository,
  ListClientsData,
  ListSystemClientsData,
} from "@/repositories/contracts/IClientAdminRepository";
import type { IClientCache } from "@/cache/contracts/IClientCache";
import { clientAdminRepository } from "@/repositories";
import { clientCache } from "@/cache";

function toDashboardUserItem(row: {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  banReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}): DashboardUserItem {
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

function toPaginatedResponse(result: {
  clients: {
    id: string;
    fullName: string;
    email: string;
    role: string;
    status: string;
    banReason: string | null;
    createdAt: Date;
    updatedAt: Date;
  }[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}): PaginatedUsersResponse {
  return {
    users: result.clients.map(toDashboardUserItem),
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
    private readonly clientAdminRepo: IClientAdminRepository,
    private readonly clientCacheService: IClientCache,
  ) {}

  async listUsers(params: ListUsersParams): Promise<PaginatedUsersResponse> {
    const data: ListClientsData = validateOrThrow(ListUsersSchema, params);
    const result = await this.clientAdminRepo.listClients(data);
    return toPaginatedResponse(result);
  }

  async listSystemUsers(params: ListSystemUsersParams): Promise<PaginatedUsersResponse> {
    const data: ListSystemClientsData = validateOrThrow(ListSystemUsersSchema, params);
    const result = await this.clientAdminRepo.listSystemClients(data);
    return toPaginatedResponse(result);
  }

  async activateUser(userId: string): Promise<DashboardActionResponse> {
    const result = await this.clientAdminRepo.activateClient(userId);
    if (!result) {
      throw APIError.notFound("Usuário não encontrado.");
    }
    await this.clientCacheService.invalidate(userId);
    return toDashboardAction(result);
  }

  async banUser(payload: BanUserParams): Promise<DashboardActionResponse> {
    const { reason } = validateOrThrow(BanUserSchema, payload);
    const result = await this.clientAdminRepo.banClient(payload.id, reason);
    if (!result) {
      throw APIError.notFound("Usuário não encontrado.");
    }
    await this.clientCacheService.invalidate(payload.id);
    return toDashboardAction(result);
  }
}

export const dashboardService = new DashboardService(clientAdminRepository, clientCache);
