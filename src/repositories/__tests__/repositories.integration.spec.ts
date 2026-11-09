import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";

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
      expect(roles).toEqual(["CLIENT"]);

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
      expect(created.driverStatus).toBe("PENDING");
      expect(created.accountStatus).toBe("ACTIVE");

      expect(await driverRepository.findStatusByUserId(created.id)).toBe("PENDING");

      const profile = await driverRepository.findProfileByUserId(created.id);
      expect(profile?.driverStatus).toBe("PENDING");
      expect(profile?.accountStatus).toBe("ACTIVE");

      const roles = await userRepository.findRolesByUserId(created.id);
      expect(roles).toEqual(["DRIVER"]);
    } finally {
      await db.delete(users).where(eq(users.id, created.id));
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

      await sessionRepository.create({
        id: sessionId,
        userId: user.id,
        refreshTokenHash: oldHash,
        expiresAt: new Date(Date.now() + 60_000),
      });

      expect(await sessionRepository.findActiveById(sessionId)).toEqual({ id: sessionId, userId: user.id });

      // Hash esperado incorreto não rotaciona.
      expect(
        await sessionRepository.rotateRefreshToken({
          sessionId,
          expectedRefreshTokenHash: "c".repeat(64),
          newRefreshTokenHash: newHash,
          newExpiresAt: new Date(Date.now() + 120_000),
        }),
      ).toBe(false);

      // Hash correto rotaciona.
      expect(
        await sessionRepository.rotateRefreshToken({
          sessionId,
          expectedRefreshTokenHash: oldHash,
          newRefreshTokenHash: newHash,
          newExpiresAt: new Date(Date.now() + 120_000),
        }),
      ).toBe(true);

      // Reconsumo do hash antigo falha (CAS) — jamais duas rotações.
      expect(
        await sessionRepository.rotateRefreshToken({
          sessionId,
          expectedRefreshTokenHash: oldHash,
          newRefreshTokenHash: "d".repeat(64),
          newExpiresAt: new Date(Date.now() + 120_000),
        }),
      ).toBe(false);

      // Revogação idempotente e efeito imediato na validação.
      expect(await sessionRepository.revoke(sessionId, user.id)).toBe(true);
      expect(await sessionRepository.revoke(sessionId, user.id)).toBe(false);
      expect(await sessionRepository.findActiveById(sessionId)).toBeNull();

      // Revogar sessão de outro usuário não afeta a sessão.
      expect(await sessionRepository.revoke(sessionId, "outro-usuario")).toBe(false);
    } finally {
      await db.delete(users).where(eq(users.id, user.id));
    }
  });
});
