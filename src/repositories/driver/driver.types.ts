import type { AccountStatus } from "@/domain/identity/identity.types";
import type { DriverStatus } from "@/domain/driver/driver.types";

export interface CreateDriverAccountInput {
  fullName: string;
  email: string;
  passwordHash: string;
  phone: string;
  cpf: string;
}

export interface ApplyDriverRoleInput {
  userId: string;
  phone: string;
  cpf: string;
}

/**
 * Resultado explícito da aplicação de papel DRIVER a uma identidade existente.
 * Mantém a decisão de domínio fora do repository (sem HTTP/APIError).
 */
export type ApplyDriverRoleResult =
  | { status: "created"; profile: DriverProfileWithUser }
  | { status: "already_driver" }
  | { status: "profile_conflict" }
  | { status: "user_not_found" }
  | { status: "identity_conflict"; field: "phone" | "cpf" };

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
