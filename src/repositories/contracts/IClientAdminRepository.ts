export interface AdminClientRow {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  banReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminClientListResult {
  clients: AdminClientRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminActionResult {
  id: string;
  status: string;
  banReason: string | null;
}

export interface ListClientsData {
  role: "CLIENT";
  page: number;
  limit: number;
  search: string;
  status?: "ACTIVE" | "BANNED" | "INACTIVE";
}

export interface ListSystemClientsData {
  page: number;
  limit: number;
  search: string;
  status?: "ACTIVE" | "BANNED" | "INACTIVE";
}

export interface IClientAdminRepository {
  listClients(data: ListClientsData): Promise<AdminClientListResult>;
  listSystemClients(data: ListSystemClientsData): Promise<AdminClientListResult>;
  activateClient(clientId: string): Promise<AdminActionResult | null>;
  banClient(id: string, reason: string): Promise<AdminActionResult | null>;
}
