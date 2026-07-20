import { APIError } from "encore.dev/api";
import { eq, desc, inArray, sql, and, or, ilike } from "drizzle-orm";
import { users } from "@/infra/db/schema";
import type { Role } from "@/infra/db/schema";
import type { DashboardActionResponse, BanUserParams, ListUsersParams, ListSystemUsersParams, PaginatedUsersResponse } from "@/interfaces/dashboard.interface";
import { validateOrThrow } from "@/validations/schema-validator";
import { BanUserSchema, ListUsersSchema, ListSystemUsersSchema } from "@/validations/dto/dashboard.validate";
import { DrizzleDatabase, drizzleDatabase } from "@/infra/adapters/drizzle-db.adapter";

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

export class DashboardService {
  constructor(private readonly database: DrizzleDatabase) {}

  async listUsers(params: ListUsersParams): Promise<PaginatedUsersResponse> {
    const v = validateOrThrow(ListUsersSchema, params);
    const offset = (v.page - 1) * v.limit;

    const where = and(
      eq(users.role, v.role),
      v.status ? eq(users.status, v.status) : undefined,
      v.search
        ? or(
            ilike(users.fullName, `%${v.search}%`),
            ilike(users.email, `%${v.search}%`),
          )
        : undefined,
    );

    const [data, countResult] = await Promise.all([
      this.database.db.select(LIST_COLUMNS).from(users).where(where).orderBy(desc(users.createdAt)).limit(v.limit).offset(offset),
      this.database.db.select({ count: sql<number>`count(*)` }).from(users).where(where),
    ]);

    const total = Number(countResult[0]?.count ?? 0);

    return {
      users: data,
      total,
      page: v.page,
      limit: v.limit,
      totalPages: Math.ceil(total / v.limit),
    };
  }

  async listSystemUsers(params: ListSystemUsersParams): Promise<PaginatedUsersResponse> {
    const v = validateOrThrow(ListSystemUsersSchema, params);
    const offset = (v.page - 1) * v.limit;

    const where = and(
      inArray(users.role, SYSTEM_ROLES),
      v.status ? eq(users.status, v.status) : undefined,
      v.search
        ? or(
            ilike(users.fullName, `%${v.search}%`),
            ilike(users.email, `%${v.search}%`),
          )
        : undefined,
    );

    const [data, countResult] = await Promise.all([
      this.database.db.select(LIST_COLUMNS).from(users).where(where).orderBy(desc(users.createdAt)).limit(v.limit).offset(offset),
      this.database.db.select({ count: sql<number>`count(*)` }).from(users).where(where),
    ]);

    const total = Number(countResult[0]?.count ?? 0);

    return {
      users: data,
      total,
      page: v.page,
      limit: v.limit,
      totalPages: Math.ceil(total / v.limit),
    };
  }

  async activateUser(userId: string): Promise<DashboardActionResponse> {
    const [user] = await this.database.db
      .update(users)
      .set({ status: "ACTIVE", banReason: null, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        status: users.status,
        banReason: users.banReason,
      });

    if (!user) {
      throw APIError.notFound("Usuário não encontrado.");
    }

    return user;
  }

  async banUser(payload: BanUserParams): Promise<DashboardActionResponse> {
    const validated = validateOrThrow(BanUserSchema, payload);

    const [user] = await this.database.db
      .update(users)
      .set({ status: "BANNED", banReason: validated.reason, updatedAt: new Date() })
      .where(eq(users.id, payload.id))
      .returning({
        id: users.id,
        status: users.status,
        banReason: users.banReason,
      });

    if (!user) {
      throw APIError.notFound("Usuário não encontrado.");
    }

    return user;
  }
}

export const dashboardService = new DashboardService(drizzleDatabase);
