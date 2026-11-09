import type { AccountStatus, AuthRole } from "@/domain/identity/identity.types";

/** Estados internos de usuário usados por auth/autorização — não são DTOs públicos. */

export interface UserAuth {
  id: string;
  email: string;
  passwordHash: string;
  status: AccountStatus;
}

export interface UserAuthState {
  id: string;
  status: AccountStatus;
}

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  cpf: string | null;
  status: AccountStatus;
  createdAt: Date;
}

export interface CreateClientAccountInput {
  fullName: string;
  email: string;
  passwordHash: string;
  phone?: string;
  cpf?: string;
}

export interface UserRoleAssignment {
  userId: string;
  role: AuthRole;
}
