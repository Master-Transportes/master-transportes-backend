import type { Role, UserStatus } from "@/infra/db/schema";

export interface RegisterUserDTO {
  fullName: string;
  email: string;
  password: string;
}

export interface RegisterDriverDTO {
  fullName: string;
  email: string;
  password: string;
}

export interface UpdateProfileDTO {
  fullName?: string;
  email?: string;
}

export interface ChangePasswordDTO {
  currentPassword: string;
  newPassword: string;
}

export interface UserProfileResponse {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  status: UserStatus;
}

export interface RideSummary {
  id: string;
  originName: string;
  originLat: number;
  originLng: number;
  destinationName: string;
  destinationLat: number;
  destinationLng: number;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
}

export interface RegisterAccountResponse {
  id: string;
}

export interface RideListResponse {
  rides: RideSummary[];
}
