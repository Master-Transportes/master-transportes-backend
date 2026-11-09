import type { AccountStatus } from "@/domain/identity/identity.types";

export interface ClientRegisterRequest {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
  cpf?: string;
}

export interface ClientRegisterResponse {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  cpf: string | null;
  status: AccountStatus;
  createdAt: string;
}

export interface ClientMeResponse {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  cpf: string | null;
  status: AccountStatus;
}
