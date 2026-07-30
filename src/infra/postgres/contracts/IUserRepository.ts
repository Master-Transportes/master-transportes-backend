import type { Role, UserStatus } from "@/infra/db/schema";

export interface CreateUserData {
  fullName: string;
  email: string;
  password: string;
  role: "CLIENT";
}

export interface UpdateUserData {
  fullName?: string;
  email?: string;
  updatedAt: Date;
}

export interface UserRow {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  status: UserStatus;
  banReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPasswordRow {
  id: string;
  password: string;
  role: string;
  status: string;
}

export interface IUserRepository {
  findById(id: string): Promise<UserRow | null>;
  findPasswordById(id: string): Promise<{ id: string; password: string } | null>;
  findByEmail(email: string): Promise<UserPasswordRow | null>;
  create(data: CreateUserData): Promise<{ id: string }>;
  update(id: string, data: UpdateUserData): Promise<UserRow | null>;
  updatePassword(id: string, password: string): Promise<void>;
}
