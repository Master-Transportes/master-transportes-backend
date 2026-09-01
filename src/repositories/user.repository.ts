import { eq, and, isNull } from "drizzle-orm";
import { users } from "@/infra/database/schema";
import { db } from "@/infra/database/drizzle";
import type {
  IUserRepository,
  UserRow,
  UserPasswordRow,
  CreateUserData,
  UpdateUserData,
} from "./contracts/IUserRepository";

const USER_COLUMNS = {
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

export class UserRepository implements IUserRepository {
  async findById(id: string): Promise<UserRow | null> {
    const [user] = await db
      .select(USER_COLUMNS)
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)));
    return user ?? null;
  }

  async findPasswordById(id: string): Promise<{ id: string; password: string } | null> {
    const [user] = await db
      .select({ id: users.id, password: users.password })
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)));
    return user ?? null;
  }

  async findByEmail(email: string): Promise<UserPasswordRow | null> {
    const [user] = await db
      .select({
        id: users.id,
        password: users.password,
        role: users.role,
        status: users.status,
      })
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)));
    return user ?? null;
  }

  async create(data: CreateUserData): Promise<{ id: string }> {
    const [user] = await db.insert(users).values(data).returning({ id: users.id });
    return user;
  }

  async update(id: string, data: UpdateUserData): Promise<UserRow | null> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning(USER_COLUMNS);
    return user ?? null;
  }

  async updatePassword(id: string, password: string): Promise<void> {
    await db.update(users).set({ password, updatedAt: new Date() }).where(eq(users.id, id));
  }
}

export const userRepository = new UserRepository();
