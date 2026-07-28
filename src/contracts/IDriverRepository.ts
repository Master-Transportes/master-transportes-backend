import type { DriverStatus } from "@/interfaces/user-types";

export interface CreateDriverData {
  fullName: string;
}

export interface DriverRow {
  id: string;
  fullName: string;
  userId: string | null;
  status: DriverStatus;
  rejectionReason: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DriverWithProfile {
  id: string;
  fullName: string;
  email: string;
  status: DriverStatus;
}

export interface IDriverRepository {
  create(data: CreateDriverData): Promise<DriverRow>;
  findById(id: string): Promise<DriverWithProfile | null>;
  findByIdWithStatus(id: string): Promise<{ role: string; status: string } | null>;
  updateProfile(id: string, data: { fullName?: string }): Promise<DriverWithProfile | null>;
  updatePassword(id: string, password: string): Promise<void>;
}
