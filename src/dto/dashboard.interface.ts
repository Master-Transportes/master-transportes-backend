import type { Role, ClientStatus } from "./shared.types.ts";

export interface DashboardUserItem {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  status: ClientStatus;
  banReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BanUserDTO {
  reason: string;
}

export interface ActivateUserParams {
  id: string;
}

export interface BanUserParams {
  id: string;
  reason: string;
}

export interface ListUsersParams {
  role?: "CLIENT";
  page?: number;
  limit?: number;
  search?: string;
  status?: "ACTIVE" | "BANNED" | "INACTIVE";
}

export interface ListSystemUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: "ACTIVE" | "BANNED" | "INACTIVE";
}

export interface PaginatedUsersResponse {
  users: DashboardUserItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DashboardActionResponse {
  id: string;
  status: ClientStatus;
  banReason?: string | null;
}
