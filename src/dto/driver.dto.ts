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

export interface DriverMeResponse {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  cpf: string | null;
  accountStatus: AccountStatus;
  driverStatus: DriverStatus;
}
