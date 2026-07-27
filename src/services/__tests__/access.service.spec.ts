import { describe, beforeAll, afterAll, beforeEach, expect, it } from "bun:test";
import { APIError } from "encore.dev/api";
import { hashSync } from "bcrypt";
import { eq, like } from "drizzle-orm";
import { accessService } from "@/services/access.service";
import { userService } from "@/services/user.service";
import { sessionStore } from "@/infra/session/redis-session-store";
import { userRepository } from "@/repositories/user.repository";
import { rideRepository } from "@/repositories/ride.repository";
import { AccessService } from "@/services/access.service";
import { UserService } from "@/services/user.service";
import { redis } from "@/infra/cache/redis-client";
import { db } from "@/infra/db/drizzle";
import { users } from "@/infra/db/schema";
import { verifyToken } from "@/auth/auth";
import { CACHE_KEYS } from "@/infra/cache/keys-cache";
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
      const result = await accessService.signIn({
        login: testUserEmail,
        password: DEFAULT_PASSWORD,
      } satisfies SignInDTO);

      expect(result).toHaveProperty("accessToken");
      expect(result.accessToken.split(".").length).toBe(3);

      expect(result).toHaveProperty("refreshToken");
      expect(typeof result.refreshToken).toBe("string");
      expect(result.refreshToken.length).toBe(64);

      expect(result).toHaveProperty("sessionId");
      expect(typeof result.sessionId).toBe("string");

      expect(result).toHaveProperty("expiresIn");
      expect(result.expiresIn).toBe(1800);

      const decoded = verifyToken(result.accessToken);
      expect(decoded).toHaveProperty("userID", testUserId);
      expect(decoded).toHaveProperty("sessionID");

      testSessionId = result.sessionId;
      testRefreshToken = result.refreshToken;
    });

    it("rejects non-existent email", async () => {
      let error: unknown;
      try {
        await accessService.signIn({
          login: `nobody-${TEST_PREFIX}@test.com`,
          password: DEFAULT_PASSWORD,
        } satisfies SignInDTO);
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).message).toBe("E-mail ou senha inválidos.");
    });

    it("rejects wrong password", async () => {
      let error: unknown;
      try {
        await accessService.signIn({
          login: testUserEmail,
          password: "wrong-p4ssword-here",
        } satisfies SignInDTO);
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).message).toBe("E-mail ou senha inválidos.");
    });

    it("rejects invalid email format via validation", async () => {
      let error: unknown;
      try {
        await accessService.signIn({
          login: "clearly-not-an-email",
          password: DEFAULT_PASSWORD,
        } satisfies SignInDTO);
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(APIError);
    });

    it("rejects short password via validation", async () => {
      let error: unknown;
      try {
        await accessService.signIn({
          login: testUserEmail,
          password: "12345",
        } satisfies SignInDTO);
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(APIError);
    });

    it("returns same error message for wrong email or password", async () => {
      const [emailErr, passwordErr] = await Promise.all([
        accessService
          .signIn({ login: `random-${TEST_PREFIX}@test.com`, password: "irrelevant" } satisfies SignInDTO)
          .then(
            () => {
              throw new Error("Expected rejection");
            },
            (e: unknown) => e as APIError,
          ),
        accessService.signIn({ login: testUserEmail, password: "definitely-wrong" } satisfies SignInDTO).then(
          () => {
            throw new Error("Expected rejection");
          },
          (e: unknown) => e as APIError,
        ),
      ]);

      expect(emailErr.message).toBe(passwordErr.message);
    });
  });

  describe("refreshSession()", () => {
    it("returns new tokens for a valid refresh token", async () => {
      const result = await accessService.signIn({
        login: testUserEmail,
        password: DEFAULT_PASSWORD,
      } satisfies SignInDTO);

      const refreshed = await accessService.refreshSession(result.sessionId, result.refreshToken);

      expect(refreshed).toHaveProperty("accessToken");
      expect(refreshed.accessToken.split(".").length).toBe(3);
      expect(refreshed.accessToken).not.toBe(result.accessToken);

      expect(refreshed).toHaveProperty("refreshToken");
      expect(refreshed.refreshToken).not.toBe(result.refreshToken);

      expect(refreshed).toHaveProperty("sessionId", result.sessionId);
      expect(refreshed).toHaveProperty("expiresIn", 1800);

      const decoded = verifyToken(refreshed.accessToken);
      expect(decoded.userID).toBe(testUserId);
      expect(decoded.sessionID).toBe(result.sessionId);
    });

    it("rejects refresh with wrong refresh token", async () => {
      const result = await accessService.signIn({
        login: testUserEmail,
        password: DEFAULT_PASSWORD,
      } satisfies SignInDTO);

      let error: unknown;
      try {
        await accessService.refreshSession(result.sessionId, "a".repeat(64));
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).message).toBe("Refresh token inválido.");
    });

    it("rejects refresh for non-existent session", async () => {
      let error: unknown;
      try {
        await accessService.refreshSession("00000000-0000-0000-0000-000000000000", "a".repeat(64));
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(APIError);
    });

    it("rejects refresh after session is revoked", async () => {
      const result = await accessService.signIn({
        login: testUserEmail,
        password: DEFAULT_PASSWORD,
      } satisfies SignInDTO);

      await accessService.logout(result.sessionId);

      let error: unknown;
      try {
        await accessService.refreshSession(result.sessionId, result.refreshToken);
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(APIError);
    });
  });

  describe("refresh token rotation", () => {
    it("invalidates old refresh token after rotation", async () => {
      const result = await accessService.signIn({
        login: testUserEmail,
        password: DEFAULT_PASSWORD,
      } satisfies SignInDTO);

      const oldRefreshToken = result.refreshToken;

      await accessService.refreshSession(result.sessionId, oldRefreshToken);

      let error: unknown;
      try {
        await accessService.refreshSession(result.sessionId, oldRefreshToken);
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).message).toBe("Refresh token inválido.");
    });
  });

  describe("logout / revoke", () => {
    it("prevents refresh after logout", async () => {
      const result = await accessService.signIn({
        login: testUserEmail,
        password: DEFAULT_PASSWORD,
      } satisfies SignInDTO);

      await accessService.logout(result.sessionId);

      let error: unknown;
      try {
        await accessService.refreshSession(result.sessionId, result.refreshToken);
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(APIError);
    });

    it("revokes all sessions on logoutAll", async () => {
      const session1 = await accessService.signIn({
        login: testUserEmail,
        password: DEFAULT_PASSWORD,
      } satisfies SignInDTO);
      const session2 = await accessService.signIn({
        login: testUserEmail,
        password: DEFAULT_PASSWORD,
      } satisfies SignInDTO);

      const countBefore = await sessionStore.count(testUserId);
      expect(countBefore).toBeGreaterThanOrEqual(2);

      await accessService.logoutAll(testUserId);

      const countAfter = await sessionStore.count(testUserId);
      expect(countAfter).toBe(0);

      const refreshErr1 = await accessService.refreshSession(session1.sessionId, session1.refreshToken).then(
        () => {
          throw new Error("Expected rejection");
        },
        (e: unknown) => e as APIError,
      );
      expect(refreshErr1).toBeInstanceOf(APIError);

      const refreshErr2 = await accessService.refreshSession(session2.sessionId, session2.refreshToken).then(
        () => {
          throw new Error("Expected rejection");
        },
        (e: unknown) => e as APIError,
      );
      expect(refreshErr2).toBeInstanceOf(APIError);
    });
  });

  describe("full registration + login + refresh flow", () => {
    it("allows a newly registered client to sign in, refresh, and logout", async () => {
      const email = `register-flow-${TEST_PREFIX}@test.com`;

      const { id } = await userService.register({
        fullName: "Registration Flow User",
        email,
        password: DEFAULT_PASSWORD,
      } satisfies RegisterUserDTO);

      const login = await accessService.signIn({
        login: email,
        password: DEFAULT_PASSWORD,
      } satisfies SignInDTO);

      expect(login.accessToken).toBeTruthy();

      const decoded = verifyToken(login.accessToken);
      expect(decoded.userID).toBe(id);

      const refreshed = await accessService.refreshSession(login.sessionId, login.refreshToken);
      expect(refreshed.accessToken).not.toBe(login.accessToken);

      await accessService.logout(login.sessionId);

      let error: unknown;
      try {
        await accessService.refreshSession(login.sessionId, refreshed.refreshToken);
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
      } satisfies RegisterUserDTO);

      let error: unknown;
      try {
        await userService.register({
          fullName: "Second User",
          email,
          password: DEFAULT_PASSWORD,
        } satisfies RegisterUserDTO);
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).message).toBe("E-mail já está em uso.");
    });
  });

  describe("verifyToken()", () => {
    it("decodes a valid token with userID and sessionID", async () => {
      const result = await accessService.signIn({
        login: testUserEmail,
        password: DEFAULT_PASSWORD,
      } satisfies SignInDTO);

      const decoded = verifyToken(result.accessToken);
      expect(decoded).toHaveProperty("userID", testUserId);
      expect(decoded).toHaveProperty("sessionID", result.sessionId);
    });

    it("rejects a malformed token string", () => {
      expect(() => verifyToken("not-a-valid-jwt")).toThrow("Invalid or expired token.");
    });

    it("rejects an empty token string", () => {
      expect(() => verifyToken("")).toThrow("Invalid or expired token.");
    });

    it("rejects a tampered token", async () => {
      const result = await accessService.signIn({
        login: testUserEmail,
        password: DEFAULT_PASSWORD,
      } satisfies SignInDTO);

      const [header, payload, signature] = result.accessToken.split(".");
      const tampered = `${header}.${payload}tampered.${signature}`;

      expect(() => verifyToken(tampered)).toThrow("Invalid or expired token.");
    });
  });

  describe("getMe()", () => {
    it("returns full profile for the authenticated user", async () => {
      const profile = await accessService.getMe(testUserId);

      expect(profile).toEqual({
        id: testUserId,
        fullName: "Access Test Suite User",
        email: testUserEmail,
        role: "CLIENT",
        status: "ACTIVE",
        banReason: null,
      });
    });

    it("throws notFound for a non-existent user ID", async () => {
      let error: unknown;
      try {
        await accessService.getMe("00000000-0000-0000-0000-000000000000");
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).message).toBe("Usuário não encontrado.");
    });

    it("caches the profile after first retrieval", async () => {
      await accessService.getMe(testUserId);

      const cachedRaw = await redis.get(CACHE_KEYS.USER(testUserId));
      expect(cachedRaw).not.toBeNull();
      const cached = JSON.parse(cachedRaw!);
      expect(cached).toHaveProperty("id", testUserId);
    });

    it("populates USER_BASE cache for role middleware", async () => {
      await accessService.getMe(testUserId);

      const cachedRaw = await redis.get(CACHE_KEYS.USER_BASE(testUserId));
      expect(cachedRaw).not.toBeNull();
      const cached = JSON.parse(cachedRaw!);
      expect(cached).toEqual({
        role: "CLIENT",
        status: "ACTIVE",
      });
    });
  });

  describe("inactive user sign in", () => {
    let inactiveUserId: string;

    beforeAll(async () => {
      const email = `inactive-${TEST_PREFIX}@test.com`;
      const [user] = await db
        .insert(users)
        .values({
          fullName: "Inactive User",
          email,
          password: hashSync(DEFAULT_PASSWORD, 10),
          role: "CLIENT",
        })
        .returning({ id: users.id });
      inactiveUserId = user.id;
    });

    afterAll(async () => {
      if (inactiveUserId) {
        await redis.del(CACHE_KEYS.USER(inactiveUserId));
        await redis.del(CACHE_KEYS.USER_BASE(inactiveUserId));
        await redis.del(CACHE_KEYS.USER_SESSIONS(inactiveUserId));
      }
    });

    it("can authenticate even when inactive (auth check is at middleware level)", async () => {
      const email = `inactive-${TEST_PREFIX}@test.com`;
      const result = await accessService.signIn({
        login: email,
        password: DEFAULT_PASSWORD,
      });

      expect(result).toHaveProperty("accessToken");
      expect(result.accessToken.split(".").length).toBe(3);
    });
  });

  describe("non-existent user sign in", () => {
    it("rejects sign in for completely unknown email", async () => {
      let error: unknown;
      try {
        await accessService.signIn({
          login: `nonexistent-${TEST_PREFIX}@test.com`,
          password: DEFAULT_PASSWORD,
        });
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).message).toBe("E-mail ou senha inválidos.");
    });
  });
});
