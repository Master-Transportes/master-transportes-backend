import type { DriverStatus } from "@/infra/database/schema";
import type { PixKeyType } from "@/infra/database/types";

export interface CreateDriverData {
  fullName: string;
  email: string;
  cpf?: string;
  cnpj?: string;
  password: string;
}

export interface DriverRow {
  id: string;
  fullName: string;
  email: string;
  status: DriverStatus;
  rejectionReason: string | null;
  banReason: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface DriverWithProfile {
  id: string;
  fullName: string;
  email: string;
  status: DriverStatus;
  rejectionReason: string | null;
  banReason: string | null;
  deletedAt: Date | null;
}

export interface UpdatePixKeyData {
  pixKey: string;
  pixKeyType: PixKeyType;
}

export interface IDriverRepository {
  create(data: CreateDriverData): Promise<DriverRow>;
  findById(id: string): Promise<DriverWithProfile | null>;
  findByEmail(email: string): Promise<{ id: string; password: string; status: string } | null>;
  findByIdWithStatus(id: string): Promise<{ status: string } | null>;
  findPasswordById(id: string): Promise<{ id: string; password: string } | null>;
  updateProfile(id: string, data: { fullName?: string; email?: string }): Promise<DriverWithProfile | null>;
  updatePassword(id: string, password: string): Promise<void>;
  findByIdWithPixKey(id: string): Promise<{ pixKey: string | null; pixKeyType: PixKeyType | null } | null>;
  updatePixKey(id: string, data: UpdatePixKeyData): Promise<void>;
}
