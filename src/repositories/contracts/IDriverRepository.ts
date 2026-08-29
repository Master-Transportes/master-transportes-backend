import type { DriverStatus } from "@/infra/database/schema";

export interface CreateDriverData {
  fullName: string;
  email: string;
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

export interface IDriverRepository {
  create(data: CreateDriverData): Promise<DriverRow>;
  findById(id: string): Promise<DriverWithProfile | null>;
  findByEmail(email: string): Promise<{ id: string; password: string; status: string } | null>;
  findByIdWithStatus(id: string): Promise<{ status: string } | null>;
  findPasswordById(id: string): Promise<{ id: string; password: string } | null>;
  updateProfile(id: string, data: { fullName?: string; email?: string }): Promise<DriverWithProfile | null>;
  updatePassword(id: string, password: string): Promise<void>;
}
