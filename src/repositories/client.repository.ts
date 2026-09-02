import { eq, and, isNull } from "drizzle-orm";
import { users } from "@/infra/database/schema";
import { db } from "@/infra/database/drizzle";
import type {
  IClientRepository,
  ClientRow,
  ClientPasswordRow,
  CreateClientData,
  UpdateClientData,
} from "./contracts/IClientRepository";

const CLIENT_COLUMNS = {
  id: users.id,
  fullName: users.fullName,
  email: users.email,
  cpf: users.cpf,
  cnpj: users.cnpj,
  role: users.role,
  status: users.status,
  banReason: users.banReason,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
  deletedAt: users.deletedAt,
} as const;

export class ClientRepository implements IClientRepository {
  async findById(id: string): Promise<ClientRow | null> {
    const [client] = await db
      .select(CLIENT_COLUMNS)
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)));
    return client ?? null;
  }

  async findPasswordById(id: string): Promise<{ id: string; password: string } | null> {
    const [client] = await db
      .select({ id: users.id, password: users.password })
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)));
    return client ?? null;
  }

  async findByEmail(email: string): Promise<ClientPasswordRow | null> {
    const [client] = await db
      .select({
        id: users.id,
        password: users.password,
        role: users.role,
        status: users.status,
      })
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)));
    return client ?? null;
  }

  async create(data: CreateClientData): Promise<{ id: string }> {
    const [client] = await db.insert(users).values(data).returning({ id: users.id });
    return client;
  }

  async update(id: string, data: UpdateClientData): Promise<ClientRow | null> {
    const [client] = await db.update(users).set(data).where(eq(users.id, id)).returning(CLIENT_COLUMNS);
    return client ?? null;
  }

  async updatePassword(id: string, password: string): Promise<void> {
    await db.update(users).set({ password, updatedAt: new Date() }).where(eq(users.id, id));
  }
}

export const clientRepository = new ClientRepository();
