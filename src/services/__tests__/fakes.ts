/**
 * Implementações in-memory dos repositories para testes unitários.
 * Existem apenas em testes — nunca são usadas em produção.
 */
import { AccountStatus, AuthRole } from "@/domain/identity/identity.types";
import { DriverStatus } from "@/domain/driver/driver.types";
import { UniqueViolationError } from "@/repositories/database-errors";
import type { DriverRepository } from "@/repositories/driver/driver.repository";
import type {
  ApplyDriverRoleInput,
  ApplyDriverRoleResult,
  CreateDriverAccountInput,
  DriverAvailabilityRecord,
  DriverProfileWithUser,
  SetAvailabilityResult,
} from "@/repositories/driver/driver.types";
import type { SessionRepository } from "@/repositories/session/session.repository";
import type {
  ActiveSessionRecord,
  CreateSessionInput,
  RotateSessionInput,
  SessionRecord,
} from "@/repositories/session/session.types";
import type { UserRepository } from "@/repositories/user/user.repository";
import type { CreateClientAccountInput, UserAuth, UserAuthState, UserProfile } from "@/repositories/user/user.types";

export interface SeedUserInput {
  email: string;
  passwordHash: string;
  status?: AccountStatus;
  roles?: AuthRole[];
  fullName?: string;
  phone?: string | null;
  cpf?: string | null;
}

interface FakeUserRecord extends UserProfile {
  passwordHash: string;
}

export type { FakeUserRecord };

export class FakeUserRepository implements UserRepository {
  private readonly users: FakeUserRecord[] = [];
  private readonly rolesByUserId = new Map<string, AuthRole[]>();
  private sequence = 0;
  nextCreateError: Error | null = null;
  nextFindError: Error | null = null;

  seed(input: SeedUserInput): FakeUserRecord {
    this.sequence += 1;
    const user: FakeUserRecord = {
      id: `user-${this.sequence}`,
      fullName: input.fullName ?? "Usuário de Teste",
      email: input.email,
      phone: input.phone ?? null,
      cpf: input.cpf ?? null,
      status: input.status ?? AccountStatus.ACTIVE,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      passwordHash: input.passwordHash,
    };

    this.users.push(user);
    this.rolesByUserId.set(user.id, input.roles ?? [AuthRole.Client]);

    return user;
  }

  async createClientAccount(input: CreateClientAccountInput): Promise<UserProfile> {
    if (this.nextCreateError) {
      const error = this.nextCreateError;
      this.nextCreateError = null;
      throw error;
    }

    if (this.users.some(user => user.email === input.email)) {
      throw new UniqueViolationError("users_email_lower_unique");
    }
    if (input.cpf && this.users.some(user => user.cpf === input.cpf)) {
      throw new UniqueViolationError("users_cpf_unique");
    }

    this.sequence += 1;
    const user: FakeUserRecord = {
      id: `user-${this.sequence}`,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone ?? null,
      cpf: input.cpf ?? null,
      status: AccountStatus.ACTIVE,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      passwordHash: input.passwordHash,
    };

    this.users.push(user);
    this.rolesByUserId.set(user.id, [AuthRole.Client]);

    return user;
  }

  async findByEmail(email: string): Promise<UserAuth | null> {
    if (this.nextFindError) {
      const error = this.nextFindError;
      this.nextFindError = null;
      throw error;
    }

    const found = this.users.find(user => user.email === email);
    if (!found) return null;

    return { id: found.id, email: found.email, passwordHash: found.passwordHash, status: found.status };
  }

  async findAuthStateById(id: string): Promise<UserAuthState | null> {
    const found = this.users.find(user => user.id === id);
    if (!found) return null;

    return { id: found.id, status: found.status };
  }

  async findProfileById(id: string): Promise<UserProfile | null> {
    const found = this.users.find(user => user.id === id);
    if (!found) return null;

    return {
      id: found.id,
      fullName: found.fullName,
      email: found.email,
      phone: found.phone,
      cpf: found.cpf,
      status: found.status,
      createdAt: found.createdAt,
    };
  }

  async findRolesByUserId(userId: string): Promise<AuthRole[]> {
    return [...(this.rolesByUserId.get(userId) ?? [])];
  }

  countUsers(): number {
    return this.users.length;
  }

  /** Auxiliar de teste: altera status da conta (ex.: simular BANNED após login). */
  setStatus(userId: string, status: AccountStatus): void {
    const user = this.users.find(candidate => candidate.id === userId);
    if (!user) throw new Error(`Usuário de teste não encontrado: ${userId}`);
    user.status = status;
  }
}

interface FakeDriverRecord extends DriverProfileWithUser {
  passwordHash: string;
  available: boolean;
}

export type { FakeDriverRecord };

export class FakeDriverRepository implements DriverRepository {
  private readonly drivers: FakeDriverRecord[] = [];
  private readonly activeRideDriverIds = new Set<string>();
  private sequence = 0;
  nextCreateError: Error | null = null;
  nextApplyResult: ApplyDriverRoleResult | null = null;
  nextApplyError: Error | null = null;

  seed(input: {
    userId?: string;
    email: string;
    passwordHash?: string;
    status?: DriverStatus;
    accountStatus?: AccountStatus;
    available?: boolean;
  }): FakeDriverRecord {
    this.sequence += 1;
    const record: FakeDriverRecord = {
      id: input.userId ?? `driver-${this.sequence}`,
      fullName: "Motorista de Teste",
      email: input.email,
      phone: "92999990000",
      cpf: "52998224725",
      accountStatus: input.accountStatus ?? AccountStatus.ACTIVE,
      driverStatus: input.status ?? DriverStatus.PENDING,
      available: input.available ?? false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      passwordHash: input.passwordHash ?? "",
    };

    this.drivers.push(record);
    return record;
  }

  async createDriverAccount(input: CreateDriverAccountInput): Promise<DriverProfileWithUser> {
    if (this.nextCreateError) {
      const error = this.nextCreateError;
      this.nextCreateError = null;
      throw error;
    }

    if (this.drivers.some(driver => driver.email === input.email)) {
      throw new UniqueViolationError("users_email_lower_unique");
    }
    if (this.drivers.some(driver => driver.cpf === input.cpf)) {
      throw new UniqueViolationError("users_cpf_unique");
    }

    this.sequence += 1;
    const record: FakeDriverRecord = {
      id: `driver-${this.sequence}`,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      cpf: input.cpf,
      accountStatus: AccountStatus.ACTIVE,
      driverStatus: DriverStatus.PENDING,
      available: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      passwordHash: input.passwordHash,
    };

    this.drivers.push(record);
    return record;
  }

  async applyDriverRole(input: ApplyDriverRoleInput): Promise<ApplyDriverRoleResult> {
    if (this.nextApplyError) {
      const error = this.nextApplyError;
      this.nextApplyError = null;
      throw error;
    }

    if (this.nextApplyResult) {
      const result = this.nextApplyResult;
      this.nextApplyResult = null;
      return result;
    }

    const found = this.drivers.find(driver => driver.id === input.userId);
    return found ? { status: "already_driver" } : { status: "user_not_found" };
  }

  /** Auxiliar de teste: define o próximo resultado da aplicação de papel. */
  setNextApplyResult(result: ApplyDriverRoleResult): void {
    this.nextApplyResult = result;
  }

  async findProfileByUserId(userId: string): Promise<DriverProfileWithUser | null> {
    const found = this.drivers.find(driver => driver.id === userId);
    if (!found) return null;

    return {
      id: found.id,
      fullName: found.fullName,
      email: found.email,
      phone: found.phone,
      cpf: found.cpf,
      accountStatus: found.accountStatus,
      driverStatus: found.driverStatus,
      createdAt: found.createdAt,
    };
  }

  async findStatusByUserId(userId: string): Promise<DriverStatus | null> {
    const found = this.drivers.find(driver => driver.id === userId);
    return found?.driverStatus ?? null;
  }

  async findAvailabilityByUserId(userId: string): Promise<DriverAvailabilityRecord | null> {
    const found = this.drivers.find(driver => driver.id === userId);
    if (!found) return null;

    return { available: found.available, driverStatus: found.driverStatus, accountStatus: found.accountStatus };
  }

  async setAvailability(userId: string, available: boolean): Promise<SetAvailabilityResult> {
    const found = this.drivers.find(driver => driver.id === userId);
    if (!found) return { status: "profile_not_found" };
    if (found.driverStatus !== DriverStatus.APPROVED) return { status: "not_approved" };

    // Ativação é bloqueada com corrida ativa; desativação nunca é bloqueada.
    if (available && this.activeRideDriverIds.has(userId)) {
      return { status: "active_ride_conflict" };
    }

    found.available = available;
    return {
      status: "updated",
      availability: {
        available: found.available,
        driverStatus: found.driverStatus,
        accountStatus: found.accountStatus,
      },
    };
  }

  /** Auxiliar de teste: simula corrida ativa (ACCEPTED/IN_PROGRESS) do motorista. */
  startActiveRide(userId: string): void {
    this.activeRideDriverIds.add(userId);
  }

  /** Auxiliar de teste: encerra a corrida ativa simulada (COMPLETED/CANCELLED). */
  endActiveRide(userId: string): void {
    this.activeRideDriverIds.delete(userId);
  }

  countDrivers(): number {
    return this.drivers.length;
  }

  /** Auxiliar de teste: altera o status do motorista (ex.: suspender após login). */
  setStatus(userId: string, status: DriverStatus): void {
    const driver = this.drivers.find(candidate => candidate.id === userId);
    if (!driver) throw new Error(`Motorista de teste não encontrado: ${userId}`);
    driver.driverStatus = status;
  }
}

type StoredSession = Omit<SessionRecord, "isExpired">;

export class FakeSessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, StoredSession>();
  private nextRotateResult: boolean | null = null;
  nextCreateError: Error | null = null;
  nextFindError: Error | null = null;
  nextRotateError: Error | null = null;

  async create(input: CreateSessionInput): Promise<void> {
    if (this.nextCreateError) {
      const error = this.nextCreateError;
      this.nextCreateError = null;
      throw error;
    }

    this.sessions.set(input.id, {
      id: input.id,
      userId: input.userId,
      refreshTokenHash: input.refreshTokenHash,
      expiresAt: new Date(Date.now() + input.ttlSeconds * 1000),
      revokedAt: null,
    });
  }

  async findById(sessionId: string): Promise<SessionRecord | null> {
    if (this.nextFindError) {
      const error = this.nextFindError;
      this.nextFindError = null;
      throw error;
    }

    return this.toRecord(this.sessions.get(sessionId));
  }

  async findActiveById(sessionId: string): Promise<ActiveSessionRecord | null> {
    const session = this.sessions.get(sessionId);
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) return null;

    return { id: session.id, userId: session.userId };
  }

  async rotateRefreshToken(input: RotateSessionInput): Promise<boolean> {
    if (this.nextRotateError) {
      const error = this.nextRotateError;
      this.nextRotateError = null;
      throw error;
    }

    if (this.nextRotateResult !== null) {
      const result = this.nextRotateResult;
      this.nextRotateResult = null;
      return result;
    }

    const session = this.sessions.get(input.sessionId);
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) return false;
    if (session.refreshTokenHash !== input.expectedRefreshTokenHash) return false;

    this.sessions.set(session.id, {
      ...session,
      refreshTokenHash: input.newRefreshTokenHash,
      expiresAt: new Date(Date.now() + input.ttlSeconds * 1000),
    });

    return true;
  }

  async revoke(sessionId: string, userId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId || session.revokedAt) return false;

    this.sessions.set(sessionId, { ...session, revokedAt: new Date() });
    return true;
  }

  getSession(sessionId: string): SessionRecord | undefined {
    return this.toRecord(this.sessions.get(sessionId)) ?? undefined;
  }

  private toRecord(session: StoredSession | undefined): SessionRecord | null {
    if (!session) return null;
    return { ...session, isExpired: session.expiresAt.getTime() <= Date.now() };
  }

  countSessions(): number {
    return this.sessions.size;
  }

  /** Auxiliar de teste: força a próxima rotação a perder o CAS. */
  forceNextRotationConflict(): void {
    this.nextRotateResult = false;
  }

  /** Auxiliar de teste: força a expiração da sessão. */
  expireSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Sessão de teste não encontrada: ${sessionId}`);
    this.sessions.set(sessionId, { ...session, expiresAt: new Date(Date.now() - 1_000) });
  }
}
