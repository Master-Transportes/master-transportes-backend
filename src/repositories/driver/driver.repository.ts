import { and, eq, isNull, sql } from "drizzle-orm";
import { AccountStatus, AuthRole } from "@/domain/identity/identity.types";
import { DriverStatus } from "@/domain/driver/driver.types";
import { db } from "@/infra/database/drizzle";
import { driverProfiles, rides, userRoles, users } from "@/infra/database/schema";
import type {
  ApplyDriverRoleInput,
  ApplyDriverRoleResult,
  CreateDriverAccountInput,
  DriverAvailabilityRecord,
  DriverProfileWithUser,
  SetAvailabilityResult,
} from "./driver.types";

export interface DriverRepository {
  /** Cria users + user_roles (DRIVER) + driver_profiles (PENDING) atomicamente. */
  createDriverAccount(input: CreateDriverAccountInput): Promise<DriverProfileWithUser>;
  /**
   * Adiciona DRIVER a uma identidade existente + perfil PENDING na mesma transação.
   * Bloqueia a linha do usuário para serializar aplicações concorrentes.
   */
  applyDriverRole(input: ApplyDriverRoleInput): Promise<ApplyDriverRoleResult>;
  findProfileByUserId(userId: string): Promise<DriverProfileWithUser | null>;
  findStatusByUserId(userId: string): Promise<DriverStatus | null>;
  findAvailabilityByUserId(userId: string): Promise<DriverAvailabilityRecord | null>;
  /**
   * Ativa/desativa a disponibilidade operacional de forma atômica: bloqueia a
   * linha do perfil, exige perfil vivo e status APPROVED antes de gravar.
   */
  setAvailability(userId: string, available: boolean): Promise<SetAvailabilityResult>;
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

      await tx.insert(driverProfiles).values({ userId: created.id, status: DriverStatus.PENDING });

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

  async applyDriverRole(input: ApplyDriverRoleInput): Promise<ApplyDriverRoleResult> {
    return db.transaction(async tx => {
      const [user] = await tx
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
        .where(and(eq(users.id, input.userId), isNull(users.deletedAt)))
        .for("update");

      if (!user) return { status: "user_not_found" };

      // A identidade é única: não sobrescrever dados já existentes com valores
      // diferentes, mas preencher o que ainda estiver ausente.
      if (user.phone !== null && user.phone !== input.phone) {
        return { status: "identity_conflict", field: "phone" };
      }
      if (user.cpf !== null && user.cpf !== input.cpf) {
        return { status: "identity_conflict", field: "cpf" };
      }

      const [existingRole] = await tx
        .select({ role: userRoles.role })
        .from(userRoles)
        .where(and(eq(userRoles.userId, input.userId), eq(userRoles.role, AuthRole.Driver)))
        .limit(1);

      if (existingRole) return { status: "already_driver" };

      const [existingProfile] = await tx
        .select({ userId: driverProfiles.userId, deletedAt: driverProfiles.deletedAt })
        .from(driverProfiles)
        .where(eq(driverProfiles.userId, input.userId))
        .limit(1);

      if (existingProfile && existingProfile.deletedAt === null) {
        return { status: "profile_conflict" };
      }

      const needsIdentityUpdate = user.phone === null || user.cpf === null;
      if (needsIdentityUpdate) {
        await tx
          .update(users)
          .set({
            ...(user.phone === null ? { phone: input.phone } : {}),
            ...(user.cpf === null ? { cpf: input.cpf } : {}),
            updatedAt: sql`now()`,
          })
          .where(eq(users.id, input.userId));
      }

      await tx.insert(userRoles).values({ userId: input.userId, role: AuthRole.Driver });

      if (existingProfile) {
        await tx
          .update(driverProfiles)
          .set({
            status: DriverStatus.PENDING,
            reviewedAt: null,
            reviewedByUserId: null,
            rejectionReason: null,
            deletedAt: null,
            updatedAt: sql`now()`,
          })
          .where(eq(driverProfiles.userId, input.userId));
      } else {
        await tx.insert(driverProfiles).values({ userId: input.userId, status: DriverStatus.PENDING });
      }

      const [profile] = await tx
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
        .where(and(eq(driverProfiles.userId, input.userId), isNull(driverProfiles.deletedAt), isNull(users.deletedAt)))
        .limit(1);

      if (!profile) {
        throw new Error("Perfil de motorista não encontrado após aplicação.");
      }

      return { status: "created", profile };
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
      .where(and(eq(driverProfiles.userId, userId), isNull(driverProfiles.deletedAt), isNull(users.deletedAt)))
      .limit(1);

    return row ?? null;
  }

  async findStatusByUserId(userId: string): Promise<DriverStatus | null> {
    const [row] = await db
      .select({ status: driverProfiles.status })
      .from(driverProfiles)
      .innerJoin(users, eq(users.id, driverProfiles.userId))
      .where(and(eq(driverProfiles.userId, userId), isNull(driverProfiles.deletedAt), isNull(users.deletedAt)))
      .limit(1);

    return row?.status ?? null;
  }

  async findAvailabilityByUserId(userId: string): Promise<DriverAvailabilityRecord | null> {
    const [row] = await db
      .select({ available: driverProfiles.available, driverStatus: driverProfiles.status, accountStatus: users.status })
      .from(driverProfiles)
      .innerJoin(users, eq(users.id, driverProfiles.userId))
      .where(and(eq(driverProfiles.userId, userId), isNull(driverProfiles.deletedAt), isNull(users.deletedAt)))
      .limit(1);

    return row ?? null;
  }

  /**
   * Ativa/desativa a disponibilidade operacional de forma atômica: bloqueia a
   * linha do perfil, exige perfil vivo e status APPROVED antes de gravar.
   * Ativar com corrida ativa (ACCEPTED/IN_PROGRESS) é bloqueado na mesma
   * transação — o aceite válido deve desativar a disponibilidade (contrato
   * documentado em docs/roadmap/mvp-tempo-real.md); este bloqueio é a segunda
   * barreira caso o aceite não tenha feito.
   */
  async setAvailability(userId: string, available: boolean): Promise<SetAvailabilityResult> {
    return db.transaction(async tx => {
      // FOR UPDATE serializa mudanças concorrentes de estado do mesmo motorista
      // (ex.: aprovação sendo gravada por um operador ao mesmo tempo).
      const [profile] = await tx
        .select({ driverStatus: driverProfiles.status, accountStatus: users.status })
        .from(driverProfiles)
        .innerJoin(users, eq(users.id, driverProfiles.userId))
        .where(and(eq(driverProfiles.userId, userId), isNull(driverProfiles.deletedAt), isNull(users.deletedAt)))
        .for("update");

      if (!profile) return { status: "profile_not_found" as const };
      if (profile.driverStatus !== DriverStatus.APPROVED) return { status: "not_approved" as const };

      if (available) {
        // Mesma transação do lock do perfil: sem janela entre verificação e
        // gravação. Desativar nunca é bloqueado (direção segura).
        const [activeRide] = await tx
          .select({ id: rides.id })
          .from(rides)
          .where(and(eq(rides.driverId, userId), sql`${rides.status} IN ('ACCEPTED', 'IN_PROGRESS')`))
          .limit(1);

        if (activeRide) return { status: "active_ride_conflict" as const };
      }

      await tx
        .update(driverProfiles)
        .set({ available, updatedAt: sql`now()` })
        .where(eq(driverProfiles.userId, userId));

      return {
        status: "updated" as const,
        availability: { available, driverStatus: profile.driverStatus, accountStatus: profile.accountStatus },
      };
    });
  }
}

export const driverRepository = new DrizzleDriverRepository();
