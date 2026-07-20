import { eq } from "drizzle-orm";
import { users } from "@/infra/db/schema";
import type { Role, UserStatus } from "@/infra/db/schema";
import { DrizzleDatabase, drizzleDatabase } from "@/infra/adapters/drizzle-db.adapter";

export interface CreateUserData {
  fullName: string;
  email: string;
  password: string;
  role: "CLIENT" | "DRIVER";
}

export interface UpdateUserData {
  fullName?: string;
  email?: string;
  updatedAt: Date;
}

export interface UserRow {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  status: UserStatus;
  banReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPasswordRow {
  id: string;
  password: string;
  role: string;
  status: string;
}

export interface IUserRepository {
  findById(id: string): Promise<UserRow | null>;
  findPasswordById(id: string): Promise<{ id: string; password: string } | null>;
  findByEmail(email: string): Promise<UserPasswordRow | null>;
  create(data: CreateUserData): Promise<{ id: string }>;
  update(id: string, data: UpdateUserData): Promise<UserRow | null>;
  updatePassword(id: string, password: string): Promise<void>;
}

export class UserRepository implements IUserRepository {
  constructor(private readonly database: DrizzleDatabase) {}

  async findById(id: string): Promise<UserRow | null> {
    const [user] = await this.database.db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        role: users.role,
        status: users.status,
        banReason: users.banReason,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, id));
    return user ?? null;
  }

  async findPasswordById(id: string): Promise<{ id: string; password: string } | null> {
    const [user] = await this.database.db
      .select({ id: users.id, password: users.password })
      .from(users)
      .where(eq(users.id, id));
    return user ?? null;
  }

  async findByEmail(email: string): Promise<UserPasswordRow | null> {
    const [user] = await this.database.db
      .select({
        id: users.id,
        password: users.password,
        role: users.role,
        status: users.status,
      })
      .from(users)
      .where(eq(users.email, email.toLowerCase()));
    return user ?? null;
  }

  async create(data: CreateUserData): Promise<{ id: string }> {
    const [user] = await this.database.db.insert(users).values(data).returning({ id: users.id });
    return user;
  }

  async update(id: string, data: UpdateUserData): Promise<UserRow | null> {
    const [user] = await this.database.db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        role: users.role,
        status: users.status,
        banReason: users.banReason,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });
    return user ?? null;
  }

  async updatePassword(id: string, password: string): Promise<void> {
    await this.database.db.update(users).set({ password, updatedAt: new Date() }).where(eq(users.id, id));
  }
}

export const userRepository = new UserRepository(drizzleDatabase);
