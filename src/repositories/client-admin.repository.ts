import { eq, desc, inArray, sql, and, ilike, isNull } from "drizzle-orm";
import { users } from "@/infra/database/schema";
import { db } from "@/infra/database/drizzle";
import { SYSTEM_ROLES } from "@/constants/system";
import type {
  IClientAdminRepository,
  ListClientsData,
  ListSystemClientsData,
  AdminClientListResult,
  AdminActionResult,
} from "./contracts/IClientAdminRepository";

const LIST_COLUMNS = {
  id: users.id,
  fullName: users.fullName,
  email: users.email,
  role: users.role,
  status: users.status,
  banReason: users.banReason,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
} as const;

export class ClientAdminRepository implements IClientAdminRepository {
  async listClients(data: ListClientsData): Promise<AdminClientListResult> {
    const offset = (data.page - 1) * data.limit;

    const where = and(
      eq(users.role, data.role),
      data.status ? eq(users.status, data.status) : undefined,
      data.search ? ilike(users.fullName, `%${data.search}%`) : undefined,
      isNull(users.deletedAt),
    );

    const [result, countResult] = await Promise.all([
      db.select(LIST_COLUMNS).from(users).where(where).orderBy(desc(users.createdAt)).limit(data.limit).offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(where),
    ]);

    const total = Number(countResult[0]?.count ?? 0);

    return {
      clients: result,
      total,
      page: data.page,
      limit: data.limit,
      totalPages: Math.ceil(total / data.limit),
    };
  }

  async listSystemClients(data: ListSystemClientsData): Promise<AdminClientListResult> {
    const offset = (data.page - 1) * data.limit;

    const where = and(
      inArray(users.role, SYSTEM_ROLES),
      data.status ? eq(users.status, data.status) : undefined,
      data.search ? ilike(users.fullName, `%${data.search}%`) : undefined,
      isNull(users.deletedAt),
    );

    const [result, countResult] = await Promise.all([
      db.select(LIST_COLUMNS).from(users).where(where).orderBy(desc(users.createdAt)).limit(data.limit).offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(where),
    ]);

    const total = Number(countResult[0]?.count ?? 0);

    return {
      clients: result,
      total,
      page: data.page,
      limit: data.limit,
      totalPages: Math.ceil(total / data.limit),
    };
  }

  async activateClient(clientId: string): Promise<AdminActionResult | null> {
    const [client] = await db
      .update(users)
      .set({ status: "ACTIVE", banReason: null, updatedAt: new Date() })
      .where(eq(users.id, clientId))
      .returning({
        id: users.id,
        status: users.status,
        banReason: users.banReason,
      });

    return client ?? null;
  }

  async banClient(id: string, reason: string): Promise<AdminActionResult | null> {
    const [client] = await db
      .update(users)
      .set({ status: "BANNED", banReason: reason, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        status: users.status,
        banReason: users.banReason,
      });

    return client ?? null;
  }
}

export const clientAdminRepository = new ClientAdminRepository();
