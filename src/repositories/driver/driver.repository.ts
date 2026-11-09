import { and, eq, isNull } from "drizzle-orm";
import { AccountStatus, AuthRole } from "@/domain/identity/identity.types";
import { DriverStatus } from "@/domain/driver/driver.types";
import { db } from "@/infra/database/drizzle";
import { driverProfiles, userRoles, users } from "@/infra/database/schema";
import type { CreateDriverAccountInput, DriverProfileWithUser } from "./driver.types";

export interface DriverRepository {
  /** Cria users + user_roles (DRIVER) + driver_profiles (PENDING) atomicamente. */
  createDriverAccount(input: CreateDriverAccountInput): Promise<DriverProfileWithUser>;
  findProfileByUserId(userId: string): Promise<DriverProfileWithUser | null>;
  findStatusByUserId(userId: string): Promise<DriverStatus | null>;
}

export class DrizzleDriverRepository implements DriverRepository {
  async createDriverAccount(input: CreateDriverAccountInput): Promise<DriverProfileWithUser> {
    return db.transaction(async tx => {
      const [created] = await tx
        .insert(users)
        .values({
          fullName: input.fullName,
          email: input.email,
          phone: input.phone,
          cpf: input.cpf,
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

      await tx.insert(userRoles).values({ userId: created.id, role: AuthRole.Driver });

      await tx.insert(driverProfiles).values({
        userId: created.id,
        status: DriverStatus.PENDING,
      });

      return {
        id: created.id,
        fullName: created.fullName,
        email: created.email,
        phone: created.phone,
        cpf: created.cpf,
        accountStatus: created.status,
        driverStatus: DriverStatus.PENDING,
        createdAt: created.createdAt,
      };
    });
  }

  async findProfileByUserId(userId: string): Promise<DriverProfileWithUser | null> {
    const [row] = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        phone: users.phone,
        cpf: users.cpf,
        accountStatus: users.status,
        driverStatus: driverProfiles.status,
        createdAt: users.createdAt,
      })
      .from(driverProfiles)
      .innerJoin(users, eq(users.id, driverProfiles.userId))
      .where(
        and(
          eq(driverProfiles.userId, userId),
          isNull(driverProfiles.deletedAt),
          isNull(users.deletedAt),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  async findStatusByUserId(userId: string): Promise<DriverStatus | null> {
    const [row] = await db
      .select({ status: driverProfiles.status })
      .from(driverProfiles)
      .where(and(eq(driverProfiles.userId, userId), isNull(driverProfiles.deletedAt)))
      .limit(1);

    return row?.status ?? null;
  }
}

export const driverRepository = new DrizzleDriverRepository();
