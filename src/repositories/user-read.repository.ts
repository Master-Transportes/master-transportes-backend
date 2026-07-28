import { eq, desc, inArray, sql, and, or, ilike } from "drizzle-orm";
import { users } from "@/infra/db/schema";
import type { Role } from "@/infra/db/schema";
import type {
  PaginatedUsersResponse,
  DashboardActionResponse,
} from "@/dto/dashboard.interface";
import { db } from "@/infra/db/drizzle";
import type { IUserReadRepository } from "@/contracts/IUserReadRepository";

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

interface ListUsersData {
  role: "DRIVER" | "CLIENT";
  page: number;
  limit: number;
  search: string;
  status?: "ACTIVE" | "BANNED" | "INACTIVE";
}

interface ListSystemUsersData {
  page: number;
  limit: number;
  search: string;
  status?: "ACTIVE" | "BANNED" | "INACTIVE";
}

export class UserReadRepository implements IUserReadRepository {
  async listUsers(data: ListUsersData): Promise<PaginatedUsersResponse> {
    const offset = (data.page - 1) * data.limit;

    const where = and(
      eq(users.role, data.role),
      data.status ? eq(users.status, data.status) : undefined,
      data.search
        ? or(
            ilike(users.fullName, `%${data.search}%`),
            ilike(users.email, `%${data.search}%`),
          )
        : undefined,
    );

    const [result, countResult] = await Promise.all([
      db.select(LIST_COLUMNS).from(users).where(where).orderBy(desc(users.createdAt)).limit(data.limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(users).where(where),
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
      data.search
        ? or(
            ilike(users.fullName, `%${data.search}%`),
            ilike(users.email, `%${data.search}%`),
          )
        : undefined,
    );

    const [result, countResult] = await Promise.all([
      db.select(LIST_COLUMNS).from(users).where(where).orderBy(desc(users.createdAt)).limit(data.limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(users).where(where),
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

export const userReadRepository = new UserReadRepository();
