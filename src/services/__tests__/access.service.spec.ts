import { describe, beforeAll, afterAll, beforeEach, expect, it } from "bun:test";
import { APIError } from "encore.dev/api";
import { hashSync } from "bcrypt";
import { like } from "drizzle-orm";
import { userService } from "@/services/user.service";
import { sessionStore } from "@/cache";
import { redis, CACHE_KEYS } from "@/infra/cache";
import { db } from "@/infra/database/drizzle";
import { users } from "@/infra/database/schema";
import { verifyToken } from "@/auth/auth";
import type { SignInDTO } from "@/dto/access.interface";
import type { RegisterUserDTO } from "@/dto/user.interface";

const TEST_PREFIX = `access-test-${Date.now()}`;
const DEFAULT_PASSWORD = "cl3an+TestP4ss";

let testUserId: string;
let testUserEmail: string;
let testSessionId: string;
let testRefreshToken: string;

describe("AccessService", () => {
  beforeAll(async () => {
    testUserEmail = `${TEST_PREFIX}@test.com`;
    const hashedPassword = hashSync(DEFAULT_PASSWORD, 10);
    const [user] = await db
      .insert(users)
      .values({
        fullName: "Access Test Suite User",
        email: testUserEmail,
        password: hashedPassword,
        role: "CLIENT",
      })
      .returning({ id: users.id });
    testUserId = user.id;
  });

  afterAll(async () => {
    await Promise.all([
      db.delete(users).where(like(users.email, `${TEST_PREFIX}%`)),
      redis.del(CACHE_KEYS.USER(testUserId)),
      redis.del(CACHE_KEYS.USER_BASE(testUserId)),
      ...(testSessionId ? [redis.del(CACHE_KEYS.SESSION(testSessionId))] : []),
      redis.del(CACHE_KEYS.USER_SESSIONS(testUserId)),
    ]);
  });

  beforeEach(async () => {
    if (testUserId) {
      await Promise.all([redis.del(CACHE_KEYS.USER(testUserId)), redis.del(CACHE_KEYS.USER_BASE(testUserId))]);
    }
  });

  describe("signIn()", () => {
    it("returns access + refresh tokens for valid credentials", async () => {
      const result = await userService.signIn({
        email: testUserEmail,
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
      expect(decoded).toHaveProperty("sub", testUserId);
      expect(decoded).toHaveProperty("sid");

      testSessionId = decoded.sid;
      testRefreshToken = result.refreshToken;
    });

    it("rejects non-existent email", async () => {
      await expect(
        userService.signIn({
          email: `nobody-${TEST_PREFIX}@test.com`,
          password: DEFAULT_PASSWORD,
        } satisfies SignInDTO),
      ).rejects.toThrow("E-mail ou senha inválidos.");
    });

    it("rejects wrong password", async () => {
      await expect(
        userService.signIn({
          email: testUserEmail,
          password: "wrong-p4ssword-here",
        } satisfies SignInDTO),
      ).rejects.toThrow("E-mail ou senha inválidos.");
    });

    it("rejects invalid email format via validation", async () => {
      await expect(
        userService.signIn({
          email: "clearly-not-an-email",
          password: DEFAULT_PASSWORD,
        } satisfies SignInDTO),
      ).rejects.toThrow(APIError);
    });

    it("rejects short password via validation", async () => {
      await expect(
        userService.signIn({
          email: testUserEmail,
          password: "12345",
        } satisfies SignInDTO),
      ).rejects.toThrow(APIError);
    });
  });

  describe("refreshSession()", () => {
    it("returns new tokens for a valid refresh token", async () => {
      const result = await userService.signIn({
        email: testUserEmail,
        password: DEFAULT_PASSWORD,
      } satisfies SignInDTO);

      const decoded = verifyToken(result.accessToken);
      const sessionId = decoded.sid;

      const refreshed = await userService.refreshSession(result.refreshToken);

      expect(refreshed).toHaveProperty("accessToken");
      expect(refreshed.accessToken.split(".").length).toBe(3);
      expect(refreshed.accessToken).not.toBe(result.accessToken);

      expect(refreshed).toHaveProperty("refreshToken");
      expect(refreshed.refreshToken).not.toBe(result.refreshToken);

      expect(refreshed).toHaveProperty("expiresIn", 900);

      const refreshedDecoded = verifyToken(refreshed.accessToken);
      expect(refreshedDecoded.sub).toBe(testUserId);
      expect(refreshedDecoded.sid).toBe(sessionId);
    });

    it("rejects refresh with wrong refresh token", async () => {
      const result = await userService.signIn({
        email: testUserEmail,
        password: DEFAULT_PASSWORD,
      } satisfies SignInDTO);

      let error: unknown;
      try {
        await userService.refreshSession("a".repeat(64));
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).message).toBe("Refresh token inválido ou expirado.");
    });

    it("rejects refresh for non-existent session", async () => {
      let error: unknown;
      try {
        await userService.refreshSession("0000000000000000000000000000000000000000000000000000000000000000");
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(APIError);
    });

    it("rejects refresh after session is revoked", async () => {
      const result = await userService.signIn({
        email: testUserEmail,
        password: DEFAULT_PASSWORD,
      } satisfies SignInDTO);

      const decoded = verifyToken(result.accessToken);
      const sessionId = decoded.sid;

      await userService.logout(sessionId);

      let error: unknown;
      try {
        await userService.refreshSession(result.refreshToken);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(APIError);
    });
  });

  describe("refresh token rotation", () => {
    it("invalidates old refresh token after rotation", async () => {
      const result = await userService.signIn({
        email: testUserEmail,
        password: DEFAULT_PASSWORD,
      } satisfies SignInDTO);

      const oldRefreshToken = result.refreshToken;

      await userService.refreshSession(oldRefreshToken);

      let error: unknown;
      try {
        await userService.refreshSession(oldRefreshToken);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).message).toBe("Refresh token inválido ou expirado.");
    });
  });

  describe("logout / revoke", () => {
    it("prevents refresh after logout", async () => {
      const result = await userService.signIn({
        email: testUserEmail,
        password: DEFAULT_PASSWORD,
      } satisfies SignInDTO);

      const decoded = verifyToken(result.accessToken);
      const sessionId = decoded.sid;

      await userService.logout(sessionId);

      let error: unknown;
      try {
        await userService.refreshSession(result.refreshToken);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(APIError);
    });

    it("revokes all sessions on logoutAll", async () => {
      const session1 = await userService.signIn({
        email: testUserEmail,
        password: DEFAULT_PASSWORD,
      } satisfies SignInDTO);
      const session2 = await userService.signIn({
        email: testUserEmail,
        password: DEFAULT_PASSWORD,
      } satisfies SignInDTO);

      const countBefore = await sessionStore.count(testUserId);
      expect(countBefore).toBeGreaterThanOrEqual(2);

      await userService.logoutAll(testUserId);

      const countAfter = await sessionStore.count(testUserId);
      expect(countAfter).toBe(0);

      for (const s of [session1, session2]) {
        let error: unknown;
        try {
          await userService.refreshSession(s.refreshToken);
        } catch (e) {
          error = e;
        }
        expect(error).toBeInstanceOf(APIError);
      }
    });
  });

  describe("full registration + login + refresh flow", () => {
    it("allows a newly registered client to sign in, refresh, and logout", async () => {
      const email = `register-flow-${TEST_PREFIX}@test.com`;

      const { id } = await userService.register({
        fullName: "Registration Flow User",
        email,
        password: DEFAULT_PASSWORD,
        confirmPassword: DEFAULT_PASSWORD,
      } satisfies RegisterUserDTO);

      const loginResult = await userService.signIn({
        email,
        password: DEFAULT_PASSWORD,
      } satisfies SignInDTO);

      expect(loginResult.accessToken).toBeTruthy();

      const decoded = verifyToken(loginResult.accessToken);
      expect(decoded.sub).toBe(id);

      const sessionId = decoded.sid;

      const refreshed = await userService.refreshSession(loginResult.refreshToken);
      expect(refreshed.accessToken).not.toBe(loginResult.accessToken);

      await userService.logout(sessionId);

      let error: unknown;
      try {
        await userService.refreshSession(refreshed.refreshToken);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(APIError);
    });

    it("rejects duplicate email on registration", async () => {
      const email = `duplicate-register-${TEST_PREFIX}@test.com`;

      await userService.register({
        fullName: "First User",
        email,
        password: DEFAULT_PASSWORD,
        confirmPassword: DEFAULT_PASSWORD,
      } satisfies RegisterUserDTO);

      let error: unknown;
      try {
        await userService.register({
          fullName: "Second User",
          email,
          password: DEFAULT_PASSWORD,
          confirmPassword: DEFAULT_PASSWORD,
        } satisfies RegisterUserDTO);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).message).toBe("E-mail já está em uso.");
    });
  });

  describe("verifyToken()", () => {
    it("decodes a valid token with sub and sid", async () => {
      const result = await userService.signIn({
        email: testUserEmail,
        password: DEFAULT_PASSWORD,
      } satisfies SignInDTO);

      const decoded = verifyToken(result.accessToken);
      expect(decoded).toHaveProperty("sub", testUserId);
      expect(decoded).toHaveProperty("sid");
    });

    it("rejects a malformed token string", () => {
      expect(() => verifyToken("not-a-valid-jwt")).toThrow(Error);
    });

    it("rejects an empty token string", () => {
      expect(() => verifyToken("")).toThrow(Error);
    });

    it("rejects a tampered token", async () => {
      const result = await userService.signIn({
        email: testUserEmail,
        password: DEFAULT_PASSWORD,
      } satisfies SignInDTO);

      const [header, payload, signature] = result.accessToken.split(".");
      const tampered = `${header}.${payload}tampered.${signature}`;

      expect(() => verifyToken(tampered)).toThrow(Error);
    });
  });

  describe("getMe()", () => {
    it("returns full profile for the authenticated user", async () => {
      const profile = await userService.getMe(testUserId);

      expect(profile).toEqual({
        id: testUserId,
        fullName: "Access Test Suite User",
        email: testUserEmail,
        status: "ACTIVE",
        banReason: null,
      });
    });

    it("throws notFound for a non-existent user ID", async () => {
      let error: unknown;
      try {
        await userService.getMe("00000000-0000-0000-0000-000000000000");
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).message).toBe("Usuário não encontrado.");
    });

    it("caches the profile after first retrieval", async () => {
      await userService.getMe(testUserId);

      const cachedRaw = await redis.get(CACHE_KEYS.USER(testUserId));
      expect(cachedRaw).not.toBeNull();
      const cached = JSON.parse(cachedRaw!);
      expect(cached).toHaveProperty("id", testUserId);
    });

    it("populates USER_BASE cache for role middleware", async () => {
      await userService.getMe(testUserId);

      const cachedRaw = await redis.get(CACHE_KEYS.USER_BASE(testUserId));
      expect(cachedRaw).not.toBeNull();
      const cached = JSON.parse(cachedRaw!);
      expect(cached).toEqual({
        role: "CLIENT",
        status: "ACTIVE",
      });
    });
  });


});
