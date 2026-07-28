import { APIError } from "encore.dev/api";
import { compare } from "bcrypt";
import { generateToken, JWT_EXPIRES_IN } from "@/auth/auth";
import { validateOrThrow } from "@/validations/schema-validator";
import { SignInSchema, RefreshSchema } from "@/validations/dto/access.validate";
import type { ISessionStore } from "@/contracts/ISessionStore";
import type { IDriverCredentialRepository } from "@/contracts/IDriverCredentialRepository";
import type { IDriverRepository } from "@/contracts/IDriverRepository";
import type { SignInDTO, SignInResponse, RefreshResponse } from "@/dto/access.interface";
import type { DriverProfileResponse } from "@/dto/driver.interface";
import { sessionStore } from "@/infra/session/redis-session-store";
import { driverCredentialRepository } from "@/repositories/driver-credential.repository";
import { driverRepository } from "@/repositories/driver.repository";

export class DriverAccessService {
  constructor(
    private readonly credentialRepo: IDriverCredentialRepository,
    private readonly driverRepo: IDriverRepository,
    private readonly sessionService: ISessionStore,
  ) {}

  async signIn(payload: SignInDTO): Promise<SignInResponse> {
    const validated = validateOrThrow(SignInSchema, payload);
    const { login, password } = validated;

    const cred = await this.credentialRepo.findByEmail(login.toLowerCase());

    if (!cred) {
      throw APIError.unauthenticated("E-mail ou senha inválidos.");
    }

    const valid = await compare(password, cred.password);
    if (!valid) {
      throw APIError.unauthenticated("E-mail ou senha inválidos.");
    }

    const { sessionId, refreshToken } = await this.sessionService.create({
      userId: cred.driverId,
      role: "DRIVER",
    });

    const accessToken = generateToken({ userID: cred.driverId, sessionID: sessionId });

    return {
      accessToken,
      refreshToken,
      sessionId,
      expiresIn: JWT_EXPIRES_IN,
    };
  }

  async getMe(driverId: string): Promise<DriverProfileResponse> {
    const profile = await this.driverRepo.findById(driverId);
    if (!profile) throw APIError.notFound("Motorista não encontrado.");
    return profile;
  }

  async logout(sessionId: string): Promise<void> {
    if (!sessionId) throw APIError.invalidArgument("Nenhuma sessão ativa.");
    await this.sessionService.revoke(sessionId);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.sessionService.revokeAll(userId);
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
}

export const driverAccessService = new DriverAccessService(
  driverCredentialRepository,
  driverRepository,
  sessionStore,
);
