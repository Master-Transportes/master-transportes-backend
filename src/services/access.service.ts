import { APIError } from "encore.dev/api";
import { compare } from "bcrypt";
import { generateToken, JWT_EXPIRES_IN } from "@/auth/auth";
import { CACHE_KEYS } from "@/infra/cache/keys-cache";
import { validateOrThrow } from "@/validations/schema-validator";
import { SignInSchema, RefreshSchema } from "@/validations/dto/access.validate";
import { SessionService } from "@/services/session.service";
import type { GetMeResponse, SignInDTO, SignInResponse, RefreshResponse } from "@/interfaces/access.interface";
import type { IUserRepository } from "@/repositories/user.repository";
import { sessionService } from "@/services/session.service";
import { userRepository } from "@/repositories/user.repository";
import { RedisCache, cache } from "@/infra/cache";

export class AccessService {
  constructor(
    private readonly cache: RedisCache,
    private readonly sessionService: SessionService,
    private readonly userRepo: IUserRepository,
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
    await this.sessionService.revoke(sessionId);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.sessionService.revokeAll(userId);
  }

  async getMe(userID: string): Promise<GetMeResponse> {
    const cached = await this.cache.get<GetMeResponse>(CACHE_KEYS.USER(userID));
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
      this.cache.set(CACHE_KEYS.USER(userID), profile, { ttlSeconds: 600 }),
      this.cache.set(
        CACHE_KEYS.USER_BASE(userID),
        {
          role: user.role,
          status: user.status,
        },
        { ttlSeconds: 600 },
      ),
    ]);

    return profile;
  }
}

export const accessService = new AccessService(cache, sessionService, userRepository);
