import { and, eq, isNull } from "drizzle-orm";
import { AccountStatus, AuthRole } from "@/domain/identity/identity.types";
import { db } from "@/infra/database/drizzle";
import { userRoles, users } from "@/infra/database/schema";
import type { CreateClientAccountInput, UserAuth, UserAuthState, UserProfile } from "./user.types";

export interface UserRepository {
  /** Cria users + user_roles (CLIENT) em uma única transação. */
  createClientAccount(input: CreateClientAccountInput): Promise<UserProfile>;
  findByEmail(email: string): Promise<UserAuth | null>;
  findAuthStateById(id: string): Promise<UserAuthState | null>;
  findProfileById(id: string): Promise<UserProfile | null>;
  findRolesByUserId(userId: string): Promise<AuthRole[]>;
}

export class DrizzleUserRepository implements UserRepository {
  async createClientAccount(input: CreateClientAccountInput): Promise<UserProfile> {
    return db.transaction(async tx => {
      const [created] = await tx
        .insert(users)
        .values({
          fullName: input.fullName,
          email: input.email,
          phone: input.phone ?? null,
          cpf: input.cpf ?? null,
          passwordHash: input.passwordHash,
          status: AccountStatus.ACTIVE,
        })
        .returning({
          id: users.id,
          fullName: users.fullName,
          email: users.email,
          phone: users.phone,
          cpf: users.cpf,
          status: users.status,
          createdAt: users.createdAt,
        });

      await tx.insert(userRoles).values({ userId: created.id, role: AuthRole.Client });

      return created;
    });
  }

  async findByEmail(email: string): Promise<UserAuth | null> {
    const [row] = await db
      .select({
        id: users.id,
        email: users.email,
        passwordHash: users.passwordHash,
        status: users.status,
      })
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);

    return row ?? null;
  }

  async findAuthStateById(id: string): Promise<UserAuthState | null> {
    const [row] = await db
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);

    return row ?? null;
  }

  async findProfileById(id: string): Promise<UserProfile | null> {
    const [row] = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        phone: users.phone,
        cpf: users.cpf,
        status: users.status,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);

    return row ?? null;
  }

  async findRolesByUserId(userId: string): Promise<AuthRole[]> {
    const rows = await db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));

    return rows.map(row => row.role);
  }
}

export const userRepository = new DrizzleUserRepository();
