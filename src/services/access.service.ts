import { APIError } from "encore.dev/api";
import { compare } from "bcrypt";
import { generateToken, JWT_EXPIRES_IN } from "@/auth/auth";
import { validateOrThrow } from "@/validations/schema-validator";
import { SignInSchema, RefreshSchema } from "@/validations/dto/access.validate";
import type { ISessionStore } from "@/contracts/ISessionStore";
import type { IUserRepository } from "@/contracts/IUserRepository";
import type { IUserCache } from "@/contracts/IUserCache";
import type { GetMeResponse, SignInDTO, SignInResponse, RefreshResponse } from "@/dto/access.interface";
import { sessionStore } from "@/infra/session/redis-session-store";
import { userRepository } from "@/repositories/user.repository";
import { userCache } from "@/infra/cache/user-cache";

export class AccessService {
  constructor(
    private readonly sessionService: ISessionStore,
    private readonly userRepo: IUserRepository,
    private readonly userCacheService: IUserCache,
  ) {}

  async signIn(payload: SignInDTO): Promise<SignInResponse> {
    const validated = validateOrThrow(SignInSchema, payload);
    const { login, password } = validated;

    const user = await this.userRepo.findByEmail(login.toLowerCase());

    if (!user) {
      throw APIError.unauthenticated("E-mail ou senha inválidos.");
    }

    if (user.status === "BANNED") {
      throw APIError.permissionDenied("Conta banida. Entre em contato com o suporte.");
    }

    const validPassword = await compare(password, user.password);
    if (!validPassword) {
      throw APIError.unauthenticated("E-mail ou senha inválidos.");
    }

    const { sessionId, refreshToken } = await this.sessionService.create({
      userId: user.id,
      role: user.role as "DRIVER" | "CLIENT" | "ADMIN" | "EMPLOYEE",
    });

    const accessToken = generateToken({ userID: user.id, sessionID: sessionId });

    return {
      accessToken,
      refreshToken,
      sessionId,
      expiresIn: JWT_EXPIRES_IN,
    };
  }

  async refreshSession(sessionId: string, refreshToken: string): Promise<RefreshResponse> {
    validateOrThrow(RefreshSchema, { refreshToken, sessionId });
    const { refreshToken: newRefreshToken, userId } = await this.sessionService.refresh(sessionId, refreshToken);

    const accessToken = generateToken({ userID: userId, sessionID: sessionId });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      sessionId,
      expiresIn: JWT_EXPIRES_IN,
    };
  }

  async logout(sessionId: string): Promise<void> {
    if (!sessionId) throw APIError.invalidArgument("Nenhuma sessão ativa.");
    await this.sessionService.revoke(sessionId);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.sessionService.revokeAll(userId);
  }

  async getUserSessions(userId: string): Promise<string[]> {
    return this.sessionService.getUserSessionIds(userId);
  }

  async getMe(userID: string): Promise<GetMeResponse> {
    const cached = await this.userCacheService.getProfile<GetMeResponse>(userID);
    if (cached) return cached;

    const user = await this.userRepo.findById(userID);
    if (!user) {
      throw APIError.notFound("Usuário não encontrado.");
    }

    const profile: GetMeResponse = {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      status: user.status,
      banReason: user.banReason,
    };

    await Promise.all([
      this.userCacheService.setProfile(userID, profile as unknown as Record<string, unknown>),
      this.userCacheService.setBase(userID, { role: user.role, status: user.status }),
    ]);

    return profile;
  }
}

export const accessService = new AccessService(sessionStore, userRepository, userCache);
