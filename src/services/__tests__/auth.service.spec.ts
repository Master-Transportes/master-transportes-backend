import { beforeAll, describe, expect, it } from "bun:test";
import { ErrCode } from "encore.dev/api";
import { AccountStatus, AuthRole } from "@/domain/identity/identity.types";
import { DriverStatus } from "@/domain/driver/driver.types";
import { hashPassword } from "@/auth/password";
import { hashRefreshToken } from "@/auth/refresh-token";
import { AuthService } from "@/services/auth.service";
import { FakeDriverRepository, FakeSessionRepository, FakeUserRepository } from "./fakes";
import { captureApiError, setTestSecrets } from "./test-helpers";

setTestSecrets();

const PASSWORD = "Str0ng#Passw0rd";
let passwordHash = "";

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

function setup() {
  const users = new FakeUserRepository();
  const drivers = new FakeDriverRepository();
  const sessions = new FakeSessionRepository();
  const service = new AuthService(users, drivers, sessions);

  return { users, drivers, sessions, service };
}

describe("AuthService.login — passageiro", () => {
  it("autentica credenciais válidas e persiste somente o hash do refresh token", async () => {
    const { users, sessions, service } = setup();
    const user = users.seed({ email: "client@test.com", passwordHash });

    const response = await service.login({ email: "client@test.com", password: PASSWORD }, AuthRole.Client);

    expect(response.accessToken.split(".")).toHaveLength(3);
    expect(response.refreshToken.length).toBeGreaterThan(64);
    expect(response.expiresIn).toBe(900);

    const session = sessions.getSession(response.sessionId);
    expect(session).toBeDefined();
    expect(session?.userId).toBe(user.id);
    expect(session?.refreshTokenHash).toBe(hashRefreshToken(response.refreshToken));
    expect(session?.refreshTokenHash).not.toBe(response.refreshToken);
  });

  it("rejeita senha incorreta e e-mail inexistente com o mesmo 401 genérico", async () => {
    const { users, service } = setup();
    users.seed({ email: "client@test.com", passwordHash });

    const wrongPassword = await captureApiError(
      service.login({ email: "client@test.com", password: "senha-errada" }, AuthRole.Client),
    );
    const unknownEmail = await captureApiError(
      service.login({ email: "ninguem@test.com", password: PASSWORD }, AuthRole.Client),
    );

    expect(wrongPassword.code).toBe(ErrCode.Unauthenticated);
    expect(unknownEmail.code).toBe(ErrCode.Unauthenticated);
    expect(wrongPassword.message).toBe(unknownEmail.message);
  });

  it("nega conta BANNED e INACTIVE", async () => {
    const { users, service } = setup();
    users.seed({ email: "banned@test.com", passwordHash, status: AccountStatus.BANNED });
    users.seed({ email: "inactive@test.com", passwordHash, status: AccountStatus.INACTIVE });

    const banned = await captureApiError(
      service.login({ email: "banned@test.com", password: PASSWORD }, AuthRole.Client),
    );
    const inactive = await captureApiError(
      service.login({ email: "inactive@test.com", password: PASSWORD }, AuthRole.Client),
    );

    expect(banned.code).toBe(ErrCode.PermissionDenied);
    expect(inactive.code).toBe(ErrCode.PermissionDenied);
  });

  it("nega login de usuário sem o papel exigido", async () => {
    const { users, service } = setup();
    users.seed({ email: "client@test.com", passwordHash, roles: [AuthRole.Client] });

    const error = await captureApiError(
      service.login({ email: "client@test.com", password: PASSWORD }, AuthRole.Driver),
    );

    expect(error.code).toBe(ErrCode.PermissionDenied);
  });
});

describe("AuthService.login — motorista (política de status)", () => {
  it("permite PENDING, UNDER_REVIEW e APPROVED", async () => {
    const { users, drivers, service } = setup();

    for (const status of [DriverStatus.PENDING, DriverStatus.UNDER_REVIEW, DriverStatus.APPROVED]) {
      const user = users.seed({
        email: `${status.toLowerCase()}@test.com`,
        passwordHash,
        roles: [AuthRole.Driver],
      });
      drivers.seed({ userId: user.id, email: user.email, status });

      const response = await service.login(
        { email: user.email, password: PASSWORD },
        AuthRole.Driver,
      );

      expect(response.sessionId).toBeTruthy();
      expect(response.expiresIn).toBe(900);
    }
  });

  it("nega REJECTED e SUSPENDED", async () => {
    const { users, drivers, service } = setup();

    for (const status of [DriverStatus.REJECTED, DriverStatus.SUSPENDED]) {
      const user = users.seed({
        email: `${status.toLowerCase()}@test.com`,
        passwordHash,
        roles: [AuthRole.Driver],
      });
      drivers.seed({ userId: user.id, email: user.email, status });

      const error = await captureApiError(
        service.login({ email: user.email, password: PASSWORD }, AuthRole.Driver),
      );

      expect(error.code).toBe(ErrCode.PermissionDenied);
    }
  });

  it("nega motorista sem driver_profiles", async () => {
    const { users, service } = setup();
    users.seed({ email: "sem-perfil@test.com", passwordHash, roles: [AuthRole.Driver] });

    const error = await captureApiError(
      service.login({ email: "sem-perfil@test.com", password: PASSWORD }, AuthRole.Driver),
    );

    expect(error.code).toBe(ErrCode.PermissionDenied);
  });
});

describe("AuthService.refresh", () => {
  it("rotaciona o refresh token e invalida o token anterior", async () => {
    const { users, sessions, service } = setup();
    users.seed({ email: "client@test.com", passwordHash });

    const login = await service.login({ email: "client@test.com", password: PASSWORD }, AuthRole.Client);

    const refreshed = await service.refresh({ refreshToken: login.refreshToken }, AuthRole.Client);

    expect(refreshed.sessionId).toBe(login.sessionId);
    expect(refreshed.refreshToken).not.toBe(login.refreshToken);
    expect(refreshed.accessToken).not.toBe(login.accessToken);
    expect(sessions.getSession(login.sessionId)?.refreshTokenHash).toBe(hashRefreshToken(refreshed.refreshToken));
  });

  it("detecta reutilização de token autêntico e revoga a sessão", async () => {
    const { users, sessions, service } = setup();
    users.seed({ email: "client@test.com", passwordHash });

    const login = await service.login({ email: "client@test.com", password: PASSWORD }, AuthRole.Client);
    await service.refresh({ refreshToken: login.refreshToken }, AuthRole.Client);

    const error = await captureApiError(
      service.refresh({ refreshToken: login.refreshToken }, AuthRole.Client),
    );

    expect(error.code).toBe(ErrCode.Unauthenticated);
    expect(sessions.getSession(login.sessionId)?.revokedAt).not.toBeNull();
  });

  it("não revoga a sessão quando o token é forjado (MAC inválido)", async () => {
    const { users, sessions, service } = setup();
    users.seed({ email: "client@test.com", passwordHash });

    const login = await service.login({ email: "client@test.com", password: PASSWORD }, AuthRole.Client);
    const forged = `${login.sessionId}.${"a".repeat(43)}.${"b".repeat(43)}`;

    const error = await captureApiError(service.refresh({ refreshToken: forged }, AuthRole.Client));

    expect(error.code).toBe(ErrCode.Unauthenticated);
    expect(sessions.getSession(login.sessionId)?.revokedAt).toBeNull();
  });

  it("rejeita sessão expirada", async () => {
    const { users, sessions, service } = setup();
    users.seed({ email: "client@test.com", passwordHash });

    const login = await service.login({ email: "client@test.com", password: PASSWORD }, AuthRole.Client);
    sessions.expireSession(login.sessionId);

    const error = await captureApiError(
      service.refresh({ refreshToken: login.refreshToken }, AuthRole.Client),
    );

    expect(error.code).toBe(ErrCode.Unauthenticated);
  });

  it("rejeita refresh de sessão revogada", async () => {
    const { users, service } = setup();
    const user = users.seed({ email: "client@test.com", passwordHash });

    const login = await service.login({ email: "client@test.com", password: PASSWORD }, AuthRole.Client);
    await service.logout({ userID: user.id, sessionId: login.sessionId, roles: [AuthRole.Client] });

    const error = await captureApiError(
      service.refresh({ refreshToken: login.refreshToken }, AuthRole.Client),
    );

    expect(error.code).toBe(ErrCode.Unauthenticated);
  });

  it("rejeita refresh quando a conta foi desativada após o login", async () => {
    const { users, service } = setup();
    const user = users.seed({ email: "client@test.com", passwordHash });

    const login = await service.login({ email: "client@test.com", password: PASSWORD }, AuthRole.Client);
    users.setStatus(user.id, AccountStatus.BANNED);

    const error = await captureApiError(
      service.refresh({ refreshToken: login.refreshToken }, AuthRole.Client),
    );

    expect(error.code).toBe(ErrCode.PermissionDenied);
  });

  it("impede que dois refreshes concorrentes tenham sucesso (CAS)", async () => {
    const { users, sessions, service } = setup();
    users.seed({ email: "client@test.com", passwordHash });

    const login = await service.login({ email: "client@test.com", password: PASSWORD }, AuthRole.Client);

    const first = await service.refresh({ refreshToken: login.refreshToken }, AuthRole.Client);
    expect(first.refreshToken).not.toBe(login.refreshToken);

    const second = await captureApiError(
      service.refresh({ refreshToken: login.refreshToken }, AuthRole.Client),
    );

    expect(second.code).toBe(ErrCode.Unauthenticated);
    expect(sessions.getSession(login.sessionId)?.revokedAt).not.toBeNull();
  });

  it("nega refresh de sessão de motorista sem papel/perfil válido", async () => {
    const { users, drivers, service } = setup();
    const user = users.seed({ email: "driver@test.com", passwordHash, roles: [AuthRole.Driver] });
    drivers.seed({ userId: user.id, email: user.email, status: DriverStatus.PENDING });

    const login = await service.login({ email: user.email, password: PASSWORD }, AuthRole.Driver);

    // Cliente tentando renovar sessão de motorista no endpoint de cliente.
    const wrongScope = await captureApiError(
      service.refresh({ refreshToken: login.refreshToken }, AuthRole.Client),
    );
    expect(wrongScope.code).toBe(ErrCode.PermissionDenied);

    // Motorista suspenso após login não renova.
    drivers.setStatus(user.id, DriverStatus.SUSPENDED);
    const suspended = await captureApiError(
      service.refresh({ refreshToken: login.refreshToken }, AuthRole.Driver),
    );
    expect(suspended.code).toBe(ErrCode.PermissionDenied);
  });
});

describe("AuthService.logout", () => {
  it("revoga a própria sessão de forma idempotente", async () => {
    const { users, sessions, service } = setup();
    const user = users.seed({ email: "client@test.com", passwordHash });

    const login = await service.login({ email: "client@test.com", password: PASSWORD }, AuthRole.Client);
    const authData = { userID: user.id, sessionId: login.sessionId, roles: [AuthRole.Client] };

    await service.logout(authData);
    expect(sessions.getSession(login.sessionId)?.revokedAt).not.toBeNull();

    await service.logout(authData); // idempotente: não lança
    expect(sessions.getSession(login.sessionId)?.revokedAt).not.toBeNull();
  });

  it("não revoga sessão de outro usuário", async () => {
    const { users, sessions, service } = setup();
    users.seed({ email: "client@test.com", passwordHash });

    const login = await service.login({ email: "client@test.com", password: PASSWORD }, AuthRole.Client);

    await service.logout({ userID: "outro-usuario", sessionId: login.sessionId, roles: [] });

    expect(sessions.getSession(login.sessionId)?.revokedAt).toBeNull();
  });
});
