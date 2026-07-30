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
import type { IUserReadRepository, ListUsersData, ListSystemUsersData } from "@/infra/postgres/contracts/IUserReadRepository";
import { userReadRepository } from "@/infra/postgres";

export class DashboardService {
  constructor(private readonly userReadRepo: IUserReadRepository) {}

  async listUsers(params: ListUsersParams): Promise<PaginatedUsersResponse> {
    const data: ListUsersData = validateOrThrow(ListUsersSchema, params);
    return this.userReadRepo.listUsers(data);
  }

  async listSystemUsers(params: ListSystemUsersParams): Promise<PaginatedUsersResponse> {
    const data: ListSystemUsersData = validateOrThrow(ListSystemUsersSchema, params);
    return this.userReadRepo.listSystemUsers(data);
  }

  async activateUser(userId: string): Promise<DashboardActionResponse> {
    const result = await this.userReadRepo.activateUser(userId);
    if (!result) {
      throw APIError.notFound("Usuário não encontrado.");
    }
    return result;
  }

  async banUser(payload: BanUserParams): Promise<DashboardActionResponse> {
    const { reason } = validateOrThrow(BanUserSchema, payload);
    const result = await this.userReadRepo.banUser(payload.id, reason);
    if (!result) {
      throw APIError.notFound("Usuário não encontrado.");
    }
    return result;
  }
}

export const dashboardService = new DashboardService(userReadRepository);
