export interface AdminUserRow {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  banReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminUserListResult {
  users: AdminUserRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminActionResult {
  id: string;
  status: string;
  banReason: string | null;
}

export interface ListUsersData {
  role: "CLIENT";
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

export interface IUserAdminRepository {
  listUsers(data: ListUsersData): Promise<AdminUserListResult>;
  listSystemUsers(data: ListSystemUsersData): Promise<AdminUserListResult>;
  activateUser(userId: string): Promise<AdminActionResult | null>;
  banUser(id: string, reason: string): Promise<AdminActionResult | null>;
}
