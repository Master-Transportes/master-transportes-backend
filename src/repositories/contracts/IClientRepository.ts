import type { Role, ClientStatus } from "@/infra/database/schema";

export interface CreateClientData {
  fullName: string;
  email: string;
  cpf?: string;
  cnpj?: string;
  password: string;
  role: Role;
}

export interface UpdateClientData {
  fullName?: string;
  email?: string;
  cpf?: string;
  cnpj?: string;
  updatedAt: Date;
}

export interface ClientRow {
  id: string;
  fullName: string;
  email: string;
  cpf: string | null;
  cnpj: string | null;
  role: Role;
  status: ClientStatus;
  banReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ClientPasswordRow {
  id: string;
  password: string;
  role: string;
  status: string;
}

export interface IClientRepository {
  findById(id: string): Promise<ClientRow | null>;
  findPasswordById(id: string): Promise<{ id: string; password: string } | null>;
  findByEmail(email: string): Promise<ClientPasswordRow | null>;
  create(data: CreateClientData): Promise<{ id: string }>;
  update(id: string, data: UpdateClientData): Promise<ClientRow | null>;
  updatePassword(id: string, password: string): Promise<void>;
}
