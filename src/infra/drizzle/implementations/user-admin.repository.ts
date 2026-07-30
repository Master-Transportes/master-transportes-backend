import { eq, desc, inArray, sql, and, ilike, isNull } from "drizzle-orm";
import { users } from "../schema";
import type { Role } from "../schema";
import type { PaginatedUsersResponse, DashboardActionResponse } from "@/dto/dashboard.interface";
import { db } from "../drizzle";
import type { IUserAdminRepository, ListUsersData, ListSystemUsersData } from "../contracts/IUserAdminRepository";

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

const SYSTEM_ROLES: Role[] = ["ADMIN", "EMPLOYEE"];

export class UserAdminRepository implements IUserAdminRepository {
  async listUsers(data: ListUsersData): Promise<PaginatedUsersResponse> {
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
      users: result,
      total,
      page: data.page,
      limit: data.limit,
      totalPages: Math.ceil(total / data.limit),
    };
  }

  async listSystemUsers(data: ListSystemUsersData): Promise<PaginatedUsersResponse> {
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
      users: result,
      total,
      page: data.page,
      limit: data.limit,
      totalPages: Math.ceil(total / data.limit),
    };
  }

  async activateUser(userId: string): Promise<DashboardActionResponse | null> {
    const [user] = await db
      .update(users)
      .set({ status: "ACTIVE", banReason: null, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        status: users.status,
        banReason: users.banReason,
      });

    return user ?? null;
  }

  async banUser(id: string, reason: string): Promise<DashboardActionResponse | null> {
    const [user] = await db
      .update(users)
      .set({ status: "BANNED", banReason: reason, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        status: users.status,
        banReason: users.banReason,
      });

    return user ?? null;
  }
}

export const userAdminRepository = new UserAdminRepository();
