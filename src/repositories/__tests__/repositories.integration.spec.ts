import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { AccountStatus, AuthRole } from "@/domain/identity/identity.types";
import { DriverStatus } from "@/domain/driver/driver.types";

/**
 * Testes de integração com PostgreSQL real.
 * Só são executados quando TEST_DATABASE_URL estiver definida E as migrations
 * da baseline tiverem sido aplicadas nesse banco. Caso contrário, o bloco é
 * ignorado (skipIf) e nenhuma conexão é aberta.
 *
 * Execução futura: TEST_DATABASE_URL=... bun test
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testDatabaseUrl)("Repositories — integração PostgreSQL", () => {
  it("cria conta CLIENT em transação e detecta e-mail duplicado pela constraint", async () => {
    if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL ausente");
    process.env.DATABASE_URL = testDatabaseUrl;

    const { userRepository } = await import("@/repositories");
    const { toUniqueViolationError } = await import("@/repositories/database-errors");
    const { db } = await import("@/infra/database/drizzle");
    const { users } = await import("@/infra/database/schema");
    const { eq } = await import("drizzle-orm");

    const email = `integration-client-${Date.now()}@test.local`;
    const created = await userRepository.createClientAccount({
      fullName: "Cliente Integração",
      email,
      passwordHash: "$2b$12$integration.placeholder.hash.value.for.tests.only",
      cpf: "52998224725",
    });

    try {
      const found = await userRepository.findByEmail(email);
      expect(found?.id).toBe(created.id);

      const roles = await userRepository.findRolesByUserId(created.id);
      expect(roles).toEqual([AuthRole.Client]);

      const duplicate = await userRepository
        .createClientAccount({
          fullName: "Duplicado",
          email,
          passwordHash: "$2b$12$integration.placeholder.hash.value.for.tests.only",
        })
        .then(
          () => null,
          (error: unknown) => error,
        );

      expect(toUniqueViolationError(duplicate)?.constraintName).toBe("users_email_lower_unique");
    } finally {
      await db.delete(users).where(eq(users.id, created.id));
    }
  });

  it("cria motorista PENDING com papel DRIVER e driver_profiles", async () => {
    if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL ausente");
    process.env.DATABASE_URL = testDatabaseUrl;

    const { driverRepository, userRepository } = await import("@/repositories");
    const { db } = await import("@/infra/database/drizzle");
    const { users } = await import("@/infra/database/schema");
    const { eq } = await import("drizzle-orm");

    const email = `integration-driver-${Date.now()}@test.local`;
    const created = await driverRepository.createDriverAccount({
      fullName: "Motorista Integração",
      email,
      passwordHash: "$2b$12$integration.placeholder.hash.value.for.tests.only",
      phone: "92999990000",
      cpf: "11144477735",
    });

    try {
      expect(created.driverStatus).toBe(DriverStatus.PENDING);
      expect(created.accountStatus).toBe(AccountStatus.ACTIVE);

      expect(await driverRepository.findStatusByUserId(created.id)).toBe(DriverStatus.PENDING);

      const profile = await driverRepository.findProfileByUserId(created.id);
      expect(profile?.driverStatus).toBe(DriverStatus.PENDING);
      expect(profile?.accountStatus).toBe(AccountStatus.ACTIVE);

      const roles = await userRepository.findRolesByUserId(created.id);
      expect(roles).toEqual([AuthRole.Driver]);
    } finally {
      await db.delete(users).where(eq(users.id, created.id));
    }
  });

  it("disponibilidade do motorista exige APPROVED e persiste a intenção", async () => {
    if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL ausente");
    process.env.DATABASE_URL = testDatabaseUrl;

    const { driverRepository } = await import("@/repositories");
    const { db } = await import("@/infra/database/drizzle");
    const { users, driverProfiles } = await import("@/infra/database/schema");
    const { eq } = await import("drizzle-orm");

    const email = `integration-availability-${Date.now()}@test.local`;
    const created = await driverRepository.createDriverAccount({
      fullName: "Disponibilidade Integração",
      email,
      passwordHash: "$2b$12$integration.placeholder.hash.value.for.tests.only",
      phone: "92999990001",
      cpf: "11144477735",
    });

    try {
      // PENDING não entra em operação.
      expect(await driverRepository.setAvailability(created.id, true)).toEqual({ status: "not_approved" });
      expect((await driverRepository.findAvailabilityByUserId(created.id))?.available).toBe(false);

      // Aprovado ativa e desativa; o estado fica persistido.
      await db
        .update(driverProfiles)
        .set({ status: DriverStatus.APPROVED })
        .where(eq(driverProfiles.userId, created.id));

      expect(await driverRepository.setAvailability(created.id, true)).toEqual({
        status: "updated",
        availability: { available: true, driverStatus: DriverStatus.APPROVED, accountStatus: AccountStatus.ACTIVE },
      });
      expect(await driverRepository.findAvailabilityByUserId(created.id)).toEqual({
        available: true,
        driverStatus: DriverStatus.APPROVED,
        accountStatus: AccountStatus.ACTIVE,
      });

      expect(await driverRepository.setAvailability(created.id, false)).toEqual({
        status: "updated",
        availability: { available: false, driverStatus: DriverStatus.APPROVED, accountStatus: AccountStatus.ACTIVE },
      });

      // Perfil removido (soft delete) deixa de responder.
      await db.update(driverProfiles).set({ deletedAt: new Date() }).where(eq(driverProfiles.userId, created.id));
      expect(await driverRepository.findAvailabilityByUserId(created.id)).toBeNull();
      expect(await driverRepository.setAvailability(created.id, true)).toEqual({ status: "profile_not_found" });
    } finally {
      await db.delete(users).where(eq(users.id, created.id));
    }
  });

  it("ativação de disponibilidade é bloqueada durante corrida ativa e liberada após conclusão", async () => {
    if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL ausente");
    process.env.DATABASE_URL = testDatabaseUrl;

    const { driverRepository, userRepository } = await import("@/repositories");
    const { db } = await import("@/infra/database/drizzle");
    const { users, driverProfiles, rideRequests, rides } = await import("@/infra/database/schema");
    const { eq, sql } = await import("drizzle-orm");

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const passwordHash = "$2b$12$integration.placeholder.hash.value.for.tests.only";

    const passenger = await userRepository.createClientAccount({
      fullName: "Passageiro Disponibilidade",
      email: `availability-passenger-${stamp}@test.local`,
      passwordHash,
    });
    const driver = await driverRepository.createDriverAccount({
      fullName: "Motorista Disponibilidade",
      email: `availability-driver-${stamp}@test.local`,
      passwordHash,
      phone: "92999990110",
      cpf: "45678912396",
    });

    try {
      await db
        .update(driverProfiles)
        .set({ status: DriverStatus.APPROVED })
        .where(eq(driverProfiles.userId, driver.id));

      const [request] = await db
        .insert(rideRequests)
        .values({
          passengerId: passenger.id,
          status: "SEARCHING",
          originLat: "0.000000",
          originLng: "0.000000",
          originAddress: "Origem",
          destinationLat: "1.000000",
          destinationLng: "1.000000",
          destinationAddress: "Destino",
          searchExpiresAt: sql`now() + interval '5 minutes'`,
        })
        .returning();

      const [ride] = await db
        .insert(rides)
        .values({
          rideRequestId: request.id,
          passengerId: passenger.id,
          driverId: driver.id,
          status: "ACCEPTED",
          originLat: "0.000000",
          originLng: "0.000000",
          originAddress: "Origem",
          destinationLat: "1.000000",
          destinationLng: "1.000000",
          destinationAddress: "Destino",
          acceptedAt: new Date(),
        })
        .returning();

      // Corrida ativa bloqueia ativação na mesma transação do lock.
      expect(await driverRepository.setAvailability(driver.id, true)).toEqual({ status: "active_ride_conflict" });
      expect((await driverRepository.findAvailabilityByUserId(driver.id))?.available).toBe(false);

      // Desativação nunca é bloqueada.
      expect(await driverRepository.setAvailability(driver.id, false)).toMatchObject({ status: "updated" });

      // Corrida concluída libera a ativação (não reativa automaticamente).
      await db
        .update(rides)
        .set({ status: "COMPLETED", startedAt: new Date(), completedAt: new Date() })
        .where(eq(rides.id, ride.id));
      expect(await driverRepository.setAvailability(driver.id, true)).toMatchObject({ status: "updated" });
    } finally {
      await db.delete(rides).where(eq(rides.driverId, driver.id));
      await db.delete(rideRequests).where(eq(rideRequests.passengerId, passenger.id));
      await db.delete(users).where(eq(users.id, passenger.id));
      await db.delete(users).where(eq(users.id, driver.id));
    }
  });

  it("alterações concorrentes de disponibilidade são serializadas sem perda de consistência", async () => {
    if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL ausente");
    process.env.DATABASE_URL = testDatabaseUrl;

    const { driverRepository } = await import("@/repositories");
    const { db } = await import("@/infra/database/drizzle");
    const { users, driverProfiles } = await import("@/infra/database/schema");
    const { eq } = await import("drizzle-orm");

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const driver = await driverRepository.createDriverAccount({
      fullName: "Motorista Concorrente",
      email: `availability-concurrent-${stamp}@test.local`,
      passwordHash: "$2b$12$integration.placeholder.hash.value.for.tests.only",
      phone: "92999990111",
      cpf: "52998224725",
    });

    try {
      await db
        .update(driverProfiles)
        .set({ status: DriverStatus.APPROVED })
        .where(eq(driverProfiles.userId, driver.id));

      // Mesmo valor em paralelo: FOR UPDATE serializa, ambas confirmam.
      const same = await Promise.all([
        driverRepository.setAvailability(driver.id, true),
        driverRepository.setAvailability(driver.id, true),
      ]);
      expect(same.every(result => result.status === "updated")).toBe(true);
      expect((await driverRepository.findAvailabilityByUserId(driver.id))?.available).toBe(true);

      // Valores opostos em paralelo: ambas confirmam (FOR UPDATE serializa) e
      // o estado final é consistente — o último commit vence, sem estado
      // corrompido nem erro de deadlock.
      const opposite = await Promise.all([
        driverRepository.setAvailability(driver.id, false),
        driverRepository.setAvailability(driver.id, true),
      ]);
      expect(opposite.every(result => result.status === "updated")).toBe(true);
      const final = (await driverRepository.findAvailabilityByUserId(driver.id))?.available;
      expect(typeof final).toBe("boolean");
    } finally {
      await db.delete(users).where(eq(users.id, driver.id));
    }
  });

  it("rotação de refresh token é compare-and-swap e revogação é idempotente", async () => {
    if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL ausente");
    process.env.DATABASE_URL = testDatabaseUrl;

    const { sessionRepository, userRepository } = await import("@/repositories");
    const { db } = await import("@/infra/database/drizzle");
    const { users } = await import("@/infra/database/schema");
    const { eq } = await import("drizzle-orm");

    const email = `integration-session-${Date.now()}@test.local`;
    const user = await userRepository.createClientAccount({
      fullName: "Sessão Integração",
      email,
      passwordHash: "$2b$12$integration.placeholder.hash.value.for.tests.only",
    });

    try {
      const sessionId = randomUUID();
      const oldHash = "a".repeat(64);
      const newHash = "b".repeat(64);

      await sessionRepository.create({ id: sessionId, userId: user.id, refreshTokenHash: oldHash, ttlSeconds: 60 });

      expect(await sessionRepository.findActiveById(sessionId)).toEqual({ id: sessionId, userId: user.id });

      // Hash esperado incorreto não rotaciona.
      expect(
        await sessionRepository.rotateRefreshToken({
          sessionId,
          expectedRefreshTokenHash: "c".repeat(64),
          newRefreshTokenHash: newHash,
          ttlSeconds: 120,
        }),
      ).toBe(false);

      // Hash correto rotaciona.
      expect(
        await sessionRepository.rotateRefreshToken({
          sessionId,
          expectedRefreshTokenHash: oldHash,
          newRefreshTokenHash: newHash,
          ttlSeconds: 120,
        }),
      ).toBe(true);

      // Reconsumo do hash antigo falha (CAS) — jamais duas rotações.
      expect(
        await sessionRepository.rotateRefreshToken({
          sessionId,
          expectedRefreshTokenHash: oldHash,
          newRefreshTokenHash: "d".repeat(64),
          ttlSeconds: 120,
        }),
      ).toBe(false);

      // Revogação idempotente e efeito imediato na validação.
      expect(await sessionRepository.revoke(sessionId, user.id)).toBe(true);
      expect(await sessionRepository.revoke(sessionId, user.id)).toBe(false);
      expect(await sessionRepository.findActiveById(sessionId)).toBeNull();

      // Revogar sessão de outro usuário não afeta a sessão.
      expect(await sessionRepository.revoke(sessionId, randomUUID())).toBe(false);
    } finally {
      await db.delete(users).where(eq(users.id, user.id));
    }
  });

  it("usa o relógio do PostgreSQL para expiração e atualiza updated_at", async () => {
    if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL ausente");
    process.env.DATABASE_URL = testDatabaseUrl;

    const { sessionRepository, userRepository } = await import("@/repositories");
    const { db } = await import("@/infra/database/drizzle");
    const { sessions, users } = await import("@/infra/database/schema");
    const { eq, sql } = await import("drizzle-orm");

    const email = `integration-session-clock-${Date.now()}@test.local`;
    const user = await userRepository.createClientAccount({
      fullName: "Sessão Relógio",
      email,
      passwordHash: "$2b$12$integration.placeholder.hash.value.for.tests.only",
    });

    try {
      const expiredId = randomUUID();
      await sessionRepository.create({
        id: expiredId,
        userId: user.id,
        refreshTokenHash: "e".repeat(64),
        ttlSeconds: -1,
      });

      expect(await sessionRepository.findActiveById(expiredId)).toBeNull();
      expect((await sessionRepository.findById(expiredId))?.isExpired).toBe(true);

      const sessionId = randomUUID();
      const oldHash = "a".repeat(64);
      await sessionRepository.create({ id: sessionId, userId: user.id, refreshTokenHash: oldHash, ttlSeconds: 60 });

      // Controla o relógio da linha para não depender da resolução de now().
      await db
        .update(sessions)
        .set({ createdAt: sql`now() - interval '1 hour'`, updatedAt: sql`now() - interval '1 hour'` })
        .where(eq(sessions.id, sessionId));

      expect(
        await sessionRepository.rotateRefreshToken({
          sessionId,
          expectedRefreshTokenHash: oldHash,
          newRefreshTokenHash: "b".repeat(64),
          ttlSeconds: 120,
        }),
      ).toBe(true);

      const [afterRotate] = await db
        .select({ createdAt: sessions.createdAt, updatedAt: sessions.updatedAt, expiresAt: sessions.expiresAt })
        .from(sessions)
        .where(eq(sessions.id, sessionId));

      expect(afterRotate.updatedAt.getTime()).toBeGreaterThan(afterRotate.createdAt.getTime());
      expect(afterRotate.expiresAt.getTime()).toBeGreaterThan(afterRotate.updatedAt.getTime());

      await db
        .update(sessions)
        .set({ updatedAt: sql`now() - interval '1 hour'` })
        .where(eq(sessions.id, sessionId));

      expect(await sessionRepository.revoke(sessionId, user.id)).toBe(true);

      const [afterRevoke] = await db
        .select({ createdAt: sessions.createdAt, updatedAt: sessions.updatedAt, revokedAt: sessions.revokedAt })
        .from(sessions)
        .where(eq(sessions.id, sessionId));

      expect(afterRevoke.revokedAt).not.toBeNull();
      expect(afterRevoke.updatedAt.getTime()).toBeGreaterThan(afterRevoke.createdAt.getTime());
      expect(await sessionRepository.findActiveById(sessionId)).toBeNull();
    } finally {
      await db.delete(users).where(eq(users.id, user.id));
    }
  });

  it("aplica DRIVER a uma identidade CLIENT atomicamente e serializa concorrência", async () => {
    if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL ausente");
    process.env.DATABASE_URL = testDatabaseUrl;

    const { driverRepository, userRepository } = await import("@/repositories");
    const { db } = await import("@/infra/database/drizzle");
    const { users } = await import("@/infra/database/schema");
    const { eq } = await import("drizzle-orm");

    const email = `integration-apply-driver-${Date.now()}@test.local`;
    const user = await userRepository.createClientAccount({
      fullName: "Cliente que vira motorista",
      email,
      passwordHash: "$2b$12$integration.placeholder.hash.value.for.tests.only",
      phone: "9233334444",
      cpf: "12345678909",
    });

    try {
      const results = await Promise.all([
        driverRepository.applyDriverRole({ userId: user.id, phone: "9233334444", cpf: "12345678909" }),
        driverRepository.applyDriverRole({ userId: user.id, phone: "9233334444", cpf: "12345678909" }),
      ]);

      expect(results.filter(result => result.status === "created")).toHaveLength(1);
      expect(results.filter(result => result.status === "already_driver")).toHaveLength(1);

      expect(await userRepository.findRolesByUserId(user.id)).toEqual([AuthRole.Client, AuthRole.Driver]);

      const profile = await driverRepository.findProfileByUserId(user.id);
      expect(profile?.driverStatus).toBe(DriverStatus.PENDING);
      expect(profile?.accountStatus).toBe(AccountStatus.ACTIVE);

      const conflict = await driverRepository.applyDriverRole({
        userId: user.id,
        phone: "9233334444",
        cpf: "12345678909",
      });
      expect(conflict).toEqual({ status: "already_driver" });
    } finally {
      await db.delete(users).where(eq(users.id, user.id));
    }
  });

  it("não expõe papéis ou status de usuário logicamente excluído", async () => {
    if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL ausente");
    process.env.DATABASE_URL = testDatabaseUrl;

    const { driverRepository, userRepository } = await import("@/repositories");
    const { db } = await import("@/infra/database/drizzle");
    const { users } = await import("@/infra/database/schema");
    const { eq, sql } = await import("drizzle-orm");

    const stamp = Date.now();
    const client = await userRepository.createClientAccount({
      fullName: "Cliente Excluído",
      email: `integration-soft-delete-client-${stamp}@test.local`,
      passwordHash: "$2b$12$integration.placeholder.hash.value.for.tests.only",
    });
    const driver = await driverRepository.createDriverAccount({
      fullName: "Motorista Excluído",
      email: `integration-soft-delete-driver-${stamp}@test.local`,
      passwordHash: "$2b$12$integration.placeholder.hash.value.for.tests.only",
      phone: "92999990002",
      cpf: "16899535009",
    });

    try {
      await db
        .update(users)
        .set({ deletedAt: sql`now()` })
        .where(eq(users.id, client.id));
      await db
        .update(users)
        .set({ deletedAt: sql`now()` })
        .where(eq(users.id, driver.id));

      expect(await userRepository.findRolesByUserId(client.id)).toEqual([]);
      expect(await userRepository.findRolesByUserId(driver.id)).toEqual([]);
      expect(await driverRepository.findStatusByUserId(driver.id)).toBeNull();
      expect(await driverRepository.findProfileByUserId(driver.id)).toBeNull();
    } finally {
      await db.delete(users).where(eq(users.id, driver.id));
      await db.delete(users).where(eq(users.id, client.id));
    }
  });
});
