import type {
  BanUserParams,
  ListUsersParams,
  ListSystemUsersParams,
  PaginatedUsersResponse,
  DashboardActionResponse,
} from "@/dto/dashboard.interface";
import type { IUserReadRepository } from "@/contracts/IUserReadRepository";
import { userReadRepository } from "@/repositories/user-read.repository";

export class DashboardService {
  constructor(private readonly userReadRepo: IUserReadRepository) {}

  async listUsers(params: ListUsersParams): Promise<PaginatedUsersResponse> {
    return this.userReadRepo.listUsers(params);
  }

  async listSystemUsers(params: ListSystemUsersParams): Promise<PaginatedUsersResponse> {
    return this.userReadRepo.listSystemUsers(params);
  }

  async activateUser(userId: string): Promise<DashboardActionResponse> {
    return this.userReadRepo.activateUser(userId);
  }

  async banUser(payload: BanUserParams): Promise<DashboardActionResponse> {
    return this.userReadRepo.banUser(payload);
  }
}

export const dashboardService = new DashboardService(userReadRepository);
