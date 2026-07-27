import type {
  BanUserParams,
  ListUsersParams,
  ListSystemUsersParams,
  PaginatedUsersResponse,
  DashboardActionResponse,
} from "@/dto/dashboard.interface";

export interface IUserReadRepository {
  listUsers(params: ListUsersParams): Promise<PaginatedUsersResponse>;
  listSystemUsers(params: ListSystemUsersParams): Promise<PaginatedUsersResponse>;
  activateUser(userId: string): Promise<DashboardActionResponse>;
  banUser(payload: BanUserParams): Promise<DashboardActionResponse>;
}
