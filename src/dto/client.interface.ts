import type { Role, ClientStatus } from "./shared.types.ts";

export interface PaginationParams {
  page?: string;
  limit?: string;
}

export interface CancelRideRequestParams {
  rideId: string;
}

export interface DepositParams {
  amountInCents: number;
}

export interface RegisterClientDTO {
  fullName: string;
  email: string;
  cpf?: string;
  cnpj?: string;
  password: string;
  confirmPassword: string;
}

export interface UpdateProfileDTO {
  fullName?: string;
  email?: string;
}

export interface ChangePasswordDTO {
  currentPassword: string;
  newPassword: string;
}

export interface ClientProfileResponse {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  status: ClientStatus;
}

export interface OriginInfo {
  name: string;
  lat: number;
  lng: number;
}

export interface DestinationInfo {
  name: string;
  lat: number;
  lng: number;
}

export interface RideSummary {
  id: string;
  origin: OriginInfo;
  destination: DestinationInfo;
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
  page: number;
  limit: number;
  total: number;
}

export interface RequestRideDTO {
  origin: OriginInfo;
  destination: DestinationInfo;
}

export interface RequestRideResponse {
  rideId: string;
}

export type { CancelRideParams } from "./shared.types.ts";

export interface ActiveRideResponse {
  ride: RideWithDriverInfo | null;
}

export interface RideWithDriverInfo {
  id: string;
  clientId: string;
  driverId: string;
  origin: OriginInfo;
  destination: DestinationInfo;
  regionId: string;
  municipalityId: string;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  price: number | null;
  distance: number | null;
  duration: number | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  createdAt: Date;
  deletedAt: Date | null;
  driver: {
    name: string;
    photo: string | null;
    vehicle: {
      brand: string;
      model: string;
      year: number;
      color: string;
      plate: string;
    } | null;
  };
}

export interface PendingRideRequestResponse {
  rideId: string | null;
}
