import { describe, beforeAll, afterAll, beforeEach, expect, it } from "bun:test";
import { APIError, ErrCode } from "encore.dev/api";
import { hashSync } from "bcrypt";
import { eq } from "drizzle-orm";
import { clientService } from "@/services/client.service";
import { sessionStore } from "@/cache";
import { redis, CACHE_KEYS } from "@/infra/cache";
import { db } from "@/infra/database/drizzle";
import { users } from "@/infra/database/schema";
import { verifyToken } from "@/auth/auth";
import type { SignInDTO } from "@/dto/access.interface";
import type { RegisterClientDTO } from "@/dto/client.interface";

const TEST_PREFIX = `access-${Date.now()}`;
const DEFAULT_PASSWORD = "cl3an+TestP4ss";
const TEST_CPF = "12345678901";

const createdUserIds: string[] = [];
const createdEmails: string[] = [];

function trackUser(id: string, email: string) {
  createdUserIds.push(id);
  createdEmails.push(email);
}

describe("AccessService", () => {
  const mainEmail = `${TEST_PREFIX}@test.com`;
  let mainUserId: string;

  beforeAll(async () => {
    const hashedPassword = hashSync(DEFAULT_PASSWORD, 10);
    const [user] = await db
      .insert(users)
      .values({
        fullName: "Access Test User",
        email: mainEmail,
        cpf: TEST_CPF,
        password: hashedPassword,
        role: "CLIENT",
      })
      .returning({ id: users.id });
    mainUserId = user.id;
    trackUser(user.id, mainEmail);
  });

  afterAll(async () => {
    for (const userId of createdUserIds) {
      await clientService.logoutAll(userId).catch(() => {});
    }

    const pipeline = redis.pipeline();
    createdUserIds.forEach(userId => {
      pipeline.del(CACHE_KEYS.CLIENT(userId));
      pipeline.del(CACHE_KEYS.CLIENT_BASE(userId));
      pipeline.del(CACHE_KEYS.CLIENT_SESSIONS(userId));
    });
    await pipeline.exec();

    await Promise.all(createdEmails.map(email => db.delete(users).where(eq(users.email, email))));
  });

  beforeEach(async () => {
    for (const userId of createdUserIds) {
      const sessionIds = await sessionStore.getUserSessionIds(userId);
      const pipeline = redis.pipeline();
      pipeline.del(CACHE_KEYS.CLIENT(userId));
      pipeline.del(CACHE_KEYS.CLIENT_BASE(userId));
      pipeline.del(CACHE_KEYS.CLIENT_SESSIONS(userId));
      sessionIds.forEach(id => pipeline.del(CACHE_KEYS.SESSION(id)));
      await pipeline.exec();
    }
  });

  describe("signIn()", () => {
    it("returns access + refresh tokens for valid credentials", async () => {
      const result = await clientService.signIn({
        email: mainEmail,
        password: DEFAULT_PASSWORD,
      } satisfies SignInDTO);

      expect(result).toHaveProperty("accessToken");
      expect(result.accessToken.split(".").length).toBe(3);

      expect(result).toHaveProperty("refreshToken");
      expect(typeof result.refreshToken).toBe("string");
      expect(result.refreshToken.length).toBe(64);

      expect(result).toHaveProperty("expiresIn");
      expect(result.expiresIn).toBe(900);

      const decoded = verifyToken(result.accessToken);
      expect(decoded).toHaveProperty("sub", mainUserId);
      expect(decoded).toHaveProperty("sid");
    });

    it("rejects non-existent email", async () => {
      const error = await clientService
        .signIn({
          email: `nobody-${TEST_PREFIX}@test.com`,
          password: DEFAULT_PASSWORD,
        } satisfies SignInDTO)
        .catch((err: unknown) => err);
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).code).toBe(ErrCode.Unauthenticated);
    });

    it("rejects wrong password", async () => {
      const error = await clientService
        .signIn({
          email: mainEmail,
          password: "wrong-p4ssword-here",
        } satisfies SignInDTO)
        .catch((err: unknown) => err);
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).code).toBe(ErrCode.Unauthenticated);
    });

    it("rejects invalid email format via validation", async () => {
      const error = await clientService
        .signIn({
          email: "clearly-not-an-email",
          password: DEFAULT_PASSWORD,
        } satisfies SignInDTO)
        .catch((err: unknown) => err);
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).code).toBe(ErrCode.InvalidArgument);
    });
  });

  describe("refreshSession()", () => {
    it("returns new tokens for a valid refresh token", async () => {
      const result = await clientService.signIn({
        email: mainEmail,
        password: DEFAULT_PASSWORD,
      } satisfies SignInDTO);

      const decoded = verifyToken(result.accessToken);
      const sessionId = decoded.sid;

      const refreshed = await clientService.refreshSession(result.refreshToken);
      expect(refreshed).toHaveProperty("accessToken");
      expect(refreshed.accessToken.split(".").length).toBe(3);
      expect(refreshed.accessToken).not.toBe(result.accessToken);

      expect(refreshed).toHaveProperty("refreshToken");
      expect(refreshed.refreshToken).not.toBe(result.refreshToken);

      expect(refreshed).toHaveProperty("expiresIn", 900);

      const refreshedDecoded = verifyToken(refreshed.accessToken);
      expect(refreshedDecoded.sub).toBe(mainUserId);
      expect(refreshedDecoded.sid).toBe(sessionId);
    });

    it("rejects refresh with wrong refresh token", async () => {
      const error = await clientService.refreshSession("a".repeat(64)).catch((err: unknown) => err);
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).code).toBe(ErrCode.Unauthenticated);
    });

    it("rejects refresh after session is revoked", async () => {
      const result = await clientService.signIn({
        email: mainEmail,
        password: DEFAULT_PASSWORD,
      } satisfies SignInDTO);

      const decoded = verifyToken(result.accessToken);
      await clientService.logout(decoded.sid);

      const error = await clientService.refreshSession(result.refreshToken).catch((err: unknown) => err);
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).code).toBe(ErrCode.Unauthenticated);
    });
  });

  describe("refresh token rotation", () => {
    it(
      "invalidates old refresh token after rotation",
      async () => {
        const result = await clientService.signIn({
          email: mainEmail,
          password: DEFAULT_PASSWORD,
        } satisfies SignInDTO);

        const oldRefreshToken = result.refreshToken;

        const refreshed = await clientService.refreshSession(oldRefreshToken);
        expect(refreshed.refreshToken).not.toBe(oldRefreshToken);

        const error = await clientService.refreshSession(oldRefreshToken).catch((err: unknown) => err);
        expect(error).toBeInstanceOf(APIError);
        expect((error as APIError).code).toBe(ErrCode.Unauthenticated);
      },
      { timeout: 15000 },
    );
  });

  describe("logout / revoke", () => {
    it("revokes all sessions on logoutAll", async () => {
      await clientService.signIn({
        email: mainEmail,
        password: DEFAULT_PASSWORD,
      } satisfies SignInDTO);
      const session2 = await clientService.signIn({
        email: mainEmail,
        password: DEFAULT_PASSWORD,
      } satisfies SignInDTO);

      const countBefore = await sessionStore.count(mainUserId);
      expect(countBefore).toBeGreaterThanOrEqual(2);

      await clientService.logoutAll(mainUserId);

      const countAfter = await sessionStore.count(mainUserId);
      expect(countAfter).toBe(0);

      const refreshError = await clientService.refreshSession(session2.refreshToken).catch((err: unknown) => err);
      expect(refreshError).toBeInstanceOf(APIError);
      expect((refreshError as APIError).code).toBe(ErrCode.Unauthenticated);
    });
  });

  describe("full registration + login + refresh flow", () => {
    it("allows a newly registered client to sign in, refresh, and logout", async () => {
      const email = `regflow-${TEST_PREFIX}@test.com`;

      const { id } = await clientService.register({
        fullName: "Registration Flow User",
        email,
        cpf: TEST_CPF,
        password: DEFAULT_PASSWORD,
        confirmPassword: DEFAULT_PASSWORD,
      } satisfies RegisterClientDTO);
      trackUser(id, email);

      const loginResult = await clientService.signIn({
        email,
        password: DEFAULT_PASSWORD,
      } satisfies SignInDTO);

      expect(loginResult.accessToken).toBeTruthy();

      const decoded = verifyToken(loginResult.accessToken);
      expect(decoded.sub).toBe(id);

      const refreshed = await clientService.refreshSession(loginResult.refreshToken);
      expect(refreshed.accessToken).not.toBe(loginResult.accessToken);

      await clientService.logout(decoded.sid);

      const logoutRefreshError = await clientService
        .refreshSession(refreshed.refreshToken)
        .catch((err: unknown) => err);
      expect(logoutRefreshError).toBeInstanceOf(APIError);
      expect((logoutRefreshError as APIError).code).toBe(ErrCode.Unauthenticated);
    });

    it("rejects duplicate email on registration", async () => {
      const email = `dup-${TEST_PREFIX}@test.com`;

      await clientService.register({
        fullName: "First User",
        email,
        cpf: TEST_CPF,
        password: DEFAULT_PASSWORD,
        confirmPassword: DEFAULT_PASSWORD,
      } satisfies RegisterClientDTO);
      trackUser("skip", email);

      const error = await clientService
        .register({
          fullName: "Second User",
          email,
          cpf: TEST_CPF,
          password: DEFAULT_PASSWORD,
          confirmPassword: DEFAULT_PASSWORD,
        } satisfies RegisterClientDTO)
        .catch((err: unknown) => err);
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).code).toBe(ErrCode.InvalidArgument);
    });
  });

  describe("verifyToken()", () => {
    it("decodes a valid token with sub and sid", async () => {
      const result = await clientService.signIn({
        email: mainEmail,
        password: DEFAULT_PASSWORD,
      } satisfies SignInDTO);

      const decoded = verifyToken(result.accessToken);
      expect(decoded).toHaveProperty("sub", mainUserId);
      expect(decoded).toHaveProperty("sid");
    });

    it("rejects a tampered token", async () => {
      const result = await clientService.signIn({
        email: mainEmail,
        password: DEFAULT_PASSWORD,
      } satisfies SignInDTO);

      const [header, payload, signature] = result.accessToken.split(".");
      const tampered = `${header}.${payload}tampered.${signature}`;

      expect(() => verifyToken(tampered)).toThrow(Error);
    });
  });

  describe("getMe()", () => {
    it("returns full profile for the authenticated user", async () => {
      const profile = await clientService.getMe(mainUserId);

      expect(profile).toEqual({
        id: mainUserId,
        fullName: "Access Test User",
        email: mainEmail,
        status: "ACTIVE",
        banReason: null,
      });
    });

    it("throws notFound for a non-existent user ID", async () => {
      const error = await clientService.getMe("00000000-0000-0000-0000-000000000000").catch((err: unknown) => err);
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).code).toBe(ErrCode.NotFound);
    });
  });
});
