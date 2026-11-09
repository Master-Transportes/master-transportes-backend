import { randomUUID } from "node:crypto";
import { APIError } from "encore.dev/api";
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from "@/constants/auth";
import { AccountStatus, AuthRole } from "@/domain/identity/identity.types";
import { DRIVER_LOGIN_ALLOWED_STATUSES } from "@/domain/driver/driver.types";
import { signAccessToken } from "@/auth/auth";
import { comparePassword } from "@/auth/password";
import { generateRefreshToken, hashRefreshToken, parseRefreshToken } from "@/auth/refresh-token";
import type { AuthData, SessionTokens } from "@/auth/auth.types";
import type { LoginRequest, LoginResponse, RefreshRequest, RefreshResponse } from "@/dto/auth.dto";
import { toLoginResponse, toRefreshResponse } from "@/mappers/auth.mapper";
import { driverRepository, sessionRepository, userRepository } from "@/repositories";
import type { DriverRepository } from "@/repositories/driver/driver.repository";
import type { SessionRepository } from "@/repositories/session/session.repository";
import type { UserRepository } from "@/repositories/user/user.repository";
import { validateOrThrow } from "@/validations/schema-validator";
import { LoginSchema, RefreshSchema } from "@/validations/auth.validate";
import { translatePersistenceError } from "./service-errors";

/**
 * Regras de autenticação compartilhadas por passageiros e motoristas:
 * login, criação de sessão, refresh com rotação atômica e logout.
 */
export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly driverRepository: DriverRepository,
    private readonly sessionRepository: SessionRepository,
  ) {}

  async login(request: LoginRequest, requiredRole: AuthRole): Promise<LoginResponse> {
    const { email, password } = validateOrThrow(LoginSchema, request);

    try {
      const user = await this.userRepository.findByEmail(email);
      if (!user) {
        throw APIError.unauthenticated("E-mail ou senha inválidos.");
      }

      const passwordMatches = await comparePassword(password, user.passwordHash);
      if (!passwordMatches) {
        throw APIError.unauthenticated("E-mail ou senha inválidos.");
      }

      if (user.status !== AccountStatus.ACTIVE) {
        throw APIError.permissionDenied("Conta indisponível.");
      }

      const roles = await this.userRepository.findRolesByUserId(user.id);
      if (!roles.includes(requiredRole)) {
        throw APIError.permissionDenied("Conta não autorizada para este tipo de acesso.");
      }

      if (requiredRole === AuthRole.Driver) {
        await this.assertDriverCanAuthenticate(user.id);
      }

      const tokens = await this.createSession(user.id);
      return toLoginResponse(tokens);
    } catch (error) {
      translatePersistenceError(error, { fallbackInternal: "Não foi possível concluir o login." });
    }
  }

  async refresh(request: RefreshRequest, requiredRole: AuthRole): Promise<RefreshResponse> {
    const { refreshToken } = validateOrThrow(RefreshSchema, request);

    const parsed = parseRefreshToken(refreshToken);
    if (!parsed || !parsed.signatureValid) {
      // Token forjado/estruturalmente inválido: NÃO toca em sessão alguma.
      throw APIError.unauthenticated("Refresh token inválido.");
    }

    try {
      const session = await this.sessionRepository.findById(parsed.sessionId);
      if (!session) {
        throw APIError.unauthenticated("Sessão inválida.");
      }
      if (session.revokedAt) {
        throw APIError.unauthenticated("Sessão revogada.");
      }
      if (session.expiresAt.getTime() <= Date.now()) {
        throw APIError.unauthenticated("Sessão expirada.");
      }

      const currentHash = hashRefreshToken(refreshToken);

      if (currentHash !== session.refreshTokenHash) {
        // Token autêntico (MAC válido) porém obsoleto → reutilização comprovada.
        await this.sessionRepository.revoke(session.id, session.userId);
        throw APIError.unauthenticated("Refresh token reutilizado. Sessão revogada por segurança.");
      }

      const user = await this.userRepository.findAuthStateById(session.userId);
      if (!user) {
        throw APIError.unauthenticated("Usuário inválido.");
      }
      if (user.status !== AccountStatus.ACTIVE) {
        throw APIError.permissionDenied("Conta indisponível.");
      }

      const roles = await this.userRepository.findRolesByUserId(session.userId);
      if (!roles.includes(requiredRole)) {
        throw APIError.permissionDenied("Conta não autorizada para este tipo de acesso.");
      }

      if (requiredRole === AuthRole.Driver) {
        await this.assertDriverCanAuthenticate(session.userId);
      }

      const newRefreshToken = generateRefreshToken(session.id);
      const rotated = await this.sessionRepository.rotateRefreshToken({
        sessionId: session.id,
        expectedRefreshTokenHash: currentHash,
        newRefreshTokenHash: hashRefreshToken(newRefreshToken),
        newExpiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
      });

      if (!rotated) {
        // Corrida perdida: outra requisição já consumiu este token autêntico.
        await this.sessionRepository.revoke(session.id, session.userId);
        throw APIError.unauthenticated("Refresh token reutilizado. Sessão revogada por segurança.");
      }

      const accessToken = await signAccessToken({
        subject: session.userId,
        sessionId: session.id,
        tokenId: randomUUID(),
      });

      const tokens: SessionTokens = {
        accessToken,
        refreshToken: newRefreshToken,
        sessionId: session.id,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      };

      return toRefreshResponse(tokens);
    } catch (error) {
      translatePersistenceError(error, { fallbackInternal: "Não foi possível renovar a sessão." });
    }
  }

  /** Idempotente: revogar sessão já revogada ou inexistente não gera erro. */
  async logout(authData: AuthData): Promise<void> {
    try {
      await this.sessionRepository.revoke(authData.sessionId, authData.userID);
    } catch (error) {
      translatePersistenceError(error, { fallbackInternal: "Não foi possível encerrar a sessão." });
    }
  }

  private async createSession(userId: string): Promise<SessionTokens> {
    const sessionId = randomUUID();
    const refreshToken = generateRefreshToken(sessionId);

    await this.sessionRepository.create({
      id: sessionId,
      userId,
      refreshTokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    });

    const accessToken = await signAccessToken({
      subject: userId,
      sessionId,
      tokenId: randomUUID(),
    });

    return {
      accessToken,
      refreshToken,
      sessionId,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  private async assertDriverCanAuthenticate(userId: string): Promise<void> {
    const status = await this.driverRepository.findStatusByUserId(userId);
    if (!status) {
      throw APIError.permissionDenied("Perfil de motorista não encontrado.");
    }
    if (!DRIVER_LOGIN_ALLOWED_STATUSES.includes(status)) {
      throw APIError.permissionDenied("Conta de motorista indisponível.");
    }
  }
}

export const authService = new AuthService(userRepository, driverRepository, sessionRepository);
