import { api } from "encore.dev/api";
import { dashboardService } from "@/services/dashboard.service";
import type {
  ActivateUserParams,
  BanUserParams,
  ListUsersParams,
  ListSystemUsersParams,
  PaginatedUsersResponse,
  DashboardActionResponse,
} from "@/dto/dashboard.interface";

export const listUsers = api<ListUsersParams, PaginatedUsersResponse>(
  { expose: true, method: "GET", path: "/dashboard/users", auth: true },
  async params => dashboardService.listUsers(params),
);

export const listSystemUsers = api<ListSystemUsersParams, PaginatedUsersResponse>(
  { expose: true, method: "GET", path: "/dashboard/users/system", auth: true },
  async params => dashboardService.listSystemUsers(params),
);

export const activateUser = api<ActivateUserParams, DashboardActionResponse>(
  { expose: true, method: "POST", path: "/dashboard/users/:id/activate", auth: true },
  async ({ id }) => dashboardService.activateUser(id),
);

export const banUser = api<BanUserParams, DashboardActionResponse>(
  { expose: true, method: "POST", path: "/dashboard/users/:id/ban", auth: true },
  async payload => dashboardService.banUser(payload),
);
