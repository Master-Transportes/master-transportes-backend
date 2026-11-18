import type { AccountStatus } from "@/domain/identity/identity.types";
import type { DriverStatus } from "@/domain/driver/driver.types";

export interface DriverRegisterRequest {
  fullName: string;
  email: string;
  password: string;
  phone: string;
  cpf: string;
}

export interface DriverRegisterResponse {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  cpf: string | null;
  accountStatus: AccountStatus;
  driverStatus: DriverStatus;
  createdAt: string;
}

/** Aplicação de papel DRIVER a uma identidade CLIENT já autenticada. */
export interface DriverApplyRequest {
  phone: string;
  cpf: string;
}

export interface DriverMeResponse {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  cpf: string | null;
  accountStatus: AccountStatus;
  driverStatus: DriverStatus;
}

/** Alteração da disponibilidade operacional do motorista. */
export interface DriverAvailabilityRequest {
  available: boolean;
}

/** Estado operacional do motorista: intenção + aprovação cadastral + conta. */
export interface DriverAvailabilityResponse {
  available: boolean;
  driverStatus: DriverStatus;
  accountStatus: AccountStatus;
}
