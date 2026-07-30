import type {
  PaginatedUsersResponse,
  DashboardActionResponse,
} from "@/dto/dashboard.interface";

export interface ListUsersData {
  role: "DRIVER" | "CLIENT";
  page: number;
  limit: number;
  search: string;
  status?: "ACTIVE" | "BANNED" | "INACTIVE";
}

export interface ListSystemUsersData {
  page: number;
  limit: number;
  search: string;
  status?: "ACTIVE" | "BANNED" | "INACTIVE";
}

export interface IUserReadRepository {
  listUsers(data: ListUsersData): Promise<PaginatedUsersResponse>;
  listSystemUsers(data: ListSystemUsersData): Promise<PaginatedUsersResponse>;
  activateUser(userId: string): Promise<DashboardActionResponse | null>;
  banUser(id: string, reason: string): Promise<DashboardActionResponse | null>;
}
