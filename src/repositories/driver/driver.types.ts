import type { AccountStatus } from "@/domain/identity/identity.types";
import type { DriverStatus } from "@/domain/driver/driver.types";

export interface CreateDriverAccountInput {
  fullName: string;
  email: string;
  passwordHash: string;
  phone: string;
  cpf: string;
}

/** Identidade (users) + estado do perfil de motorista (driver_profiles). */
export interface DriverProfileWithUser {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  cpf: string | null;
  accountStatus: AccountStatus;
  driverStatus: DriverStatus;
  createdAt: Date;
}
