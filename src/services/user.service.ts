import { APIError } from "encore.dev/api";
import { hash, compare } from "bcrypt";
import { generateToken, JWT_EXPIRES_IN } from "@/auth/auth";
import { validateOrThrow } from "@/validations/schema-validator";
import { SignInSchema, RefreshSchema } from "@/validations/dto/access.validate";
import {
  CancelRideSchema,
  ListRidesSchema,
  RegisterUserSchema,
  RequestRideSchema,
} from "@/validations/dto/user.validate";
import type {
  ChangePasswordDTO,
  RegisterUserDTO,
  UpdateProfileDTO,
  UserProfileResponse,
  RideSummary,
  RequestRideResponse,
  RequestRideDTO,
  ActiveRideResponse,
  PendingRideRequestResponse,
} from "@/dto/user.interface";
import type { SignInDTO, SignInResponse, RefreshResponse, GetMeResponse } from "@/dto/access.interface";
import type { IUserRepository } from "@/repositories/contracts/IUserRepository";
import type { ISessionStore } from "@/cache/contracts/ISessionStore";
import type { IUserCache } from "@/cache/contracts/IUserCache";
import type { IRideRepository } from "@/repositories/contracts/IRideRepository";
import type { IRideRequestStore } from "@/cache/contracts/IRideRequestStore";
import type { IDriverStatusStore } from "@/cache/contracts/IDriverStatusStore";
import type { IRideEventPublisher } from "@/messaging/contracts/IRideEventPublisher";
import type { ProfileService } from "@/services/profile.service";
import { userRepository } from "@/repositories";
import { rideRepository } from "@/repositories";
import { rideRequestStore } from "@/cache";
import { driverStatusStore } from "@/cache";
import { rideEventPublisher } from "@/messaging";
import { sessionStore } from "@/cache";
import { userCache } from "@/cache";
import { profileService } from "@/services/profile.service";
import { randomUUID } from "crypto";
import { isPgUniqueViolation } from "@/utils/database";
import type { SessionMetadata } from "@/cache/contracts/ISessionStore";
import { ACTIVE_RIDE_STATUSES } from "@/constants/ride";

export class UserService {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly sessionStore: ISessionStore,
    private readonly userCacheService: IUserCache,
    private readonly rideRepo: IRideRepository,
    private readonly rideRequestStore: IRideRequestStore,
    private readonly driverStatusStore: IDriverStatusStore,
    private readonly rideEventPublisher: IRideEventPublisher,
    private readonly profileService_: ProfileService,
  ) {}

  async register(payload: RegisterUserDTO): Promise<{ id: string }> {
    const validated = validateOrThrow(RegisterUserSchema, payload);

    const hashedPassword = await hash(validated.password, 10);
    try {
      return await this.userRepo.create({
        fullName: validated.fullName,
        email: validated.email.toLowerCase(),
        cpf: validated.cpf,
        cnpj: validated.cnpj,
        password: hashedPassword,
        role: "CLIENT",
      });
    } catch (error: unknown) {
      if (isPgUniqueViolation(error)) {
        throw APIError.invalidArgument("E-mail já está em uso.");
      }
      throw error;
    }
  }

  async signIn(payload: SignInDTO, metadata?: SessionMetadata): Promise<SignInResponse> {
    const validated = validateOrThrow(SignInSchema, payload);
    const { email, password } = validated;

    const user = await this.userRepo.findByEmail(email.toLowerCase());
    if (!user) throw APIError.unauthenticated("E-mail ou senha inválidos.");
    const validPassword = await compare(password, user.password);
    if (!validPassword) throw APIError.unauthenticated("E-mail ou senha inválidos.");

    const { sessionId, refreshToken } = await this.sessionStore.create({
      userId: user.id,
      userType: "CLIENT",
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
      deviceId: validated.deviceId,
    });

    const accessToken = generateToken({ sub: user.id, sid: sessionId, role: "CLIENT" });

    return { accessToken, refreshToken, expiresIn: JWT_EXPIRES_IN, deviceId: validated.deviceId };
  }

  async getMe(userID: string): Promise<GetMeResponse> {
    const cached = await this.userCacheService.getProfile<GetMeResponse>(userID);
    if (cached) return cached;

    const user = await this.userRepo.findById(userID);
    if (!user) throw APIError.notFound("Usuário não encontrado.");

    const profile: GetMeResponse = {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      status: user.status,
      banReason: user.banReason,
    };

    await Promise.all([
      this.userCacheService.setProfile(userID, profile as unknown as Record<string, unknown>),
      this.userCacheService.setBase(userID, { role: user.role, status: user.status }),
    ]);

    return profile;
  }

  async logout(sessionId: string): Promise<void> {
    if (!sessionId) throw APIError.invalidArgument("Nenhuma sessão ativa.");
    await this.sessionStore.revoke(sessionId);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.sessionStore.revokeAll(userId);
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.sessionStore.get(sessionId);
    if (!session || session.userId !== userId) {
      throw APIError.notFound("Sessão não encontrada.");
    }
    await this.sessionStore.revoke(sessionId);
  }

  async refreshSession(refreshToken: string): Promise<RefreshResponse> {
    const validated = validateOrThrow(RefreshSchema, { refreshToken });

    const session = await this.sessionStore.findByRefreshToken(validated.refreshToken);
    if (!session) {
      throw APIError.unauthenticated("Refresh token inválido ou expirado.");
    }

    if (session.revokedAt) {
      throw APIError.unauthenticated("Sessão revogada.");
    }

    const user = await this.userRepo.findById(session.userId);
    if (!user) {
      throw APIError.notFound("Usuário não encontrado.");
    }
    if (user.status !== "ACTIVE") {
      throw APIError.permissionDenied("Usuário inativo.");
    }

    const newRefreshToken = await this.sessionStore.rotateRefreshToken(session.id, validated.refreshToken);
    if (!newRefreshToken) {
      throw APIError.unauthenticated("Falha ao rotacionar token.");
    }

    const accessToken = generateToken({ sub: session.userId, sid: session.id, role: "CLIENT" });

    return { accessToken, refreshToken: newRefreshToken, expiresIn: JWT_EXPIRES_IN };
  }

  async getUserSessions(userId: string) {
    const sessions = await this.sessionStore.findAllActiveByUserId(userId);
    return sessions.map(s => ({
      id: s.id,
      deviceId: s.deviceId,
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
    }));
  }

  async getProfile(userID: string): Promise<UserProfileResponse> {
    return this.profileService_.getProfile(userID);
  }

  async getRides(
    userID: string,
    options?: { page?: number; limit?: number },
  ): Promise<{ rides: RideSummary[]; page: number; limit: number; total: number }> {
    const validated = validateOrThrow(ListRidesSchema, options ?? {});
    const { rides: rows, total } = await this.rideRepo.findByClientId(userID, validated.page, validated.limit);
    const rides: RideSummary[] = rows.map(row => ({
      id: row.id,
      origin: { name: row.origin.name, lat: row.origin.lat, lng: row.origin.lng },
      destination: { name: row.destination.name, lat: row.destination.lat, lng: row.destination.lng },
      status: row.status,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      cancelledAt: row.cancelledAt,
      createdAt: row.createdAt,
    }));
    return { rides, page: validated.page, limit: validated.limit, total };
  }

  async getActiveRide(passengerId: string): Promise<ActiveRideResponse> {
    const ride = await this.rideRepo.findActiveByClientDetailed(passengerId, [...ACTIVE_RIDE_STATUSES]);
    return { ride };
  }

  async getPendingRideRequest(passengerId: string): Promise<PendingRideRequestResponse> {
    const rideId = await this.rideRequestStore.getLockedRideId(passengerId);
    return { rideId };
  }

  async updateProfile(userID: string, payload: UpdateProfileDTO): Promise<UserProfileResponse> {
    return this.profileService_.updateProfile(userID, payload);
  }

  async changePassword(userID: string, payload: ChangePasswordDTO): Promise<void> {
    return this.profileService_.changePassword(userID, payload);
  }

  async requestRide(passengerId: string, payload: RequestRideDTO): Promise<RequestRideResponse> {
    const active = await this.rideRepo.findActiveByClientId(passengerId, [...ACTIVE_RIDE_STATUSES]);
    if (active) {
      throw APIError.failedPrecondition("Você já possui uma corrida em andamento.");
    }

    const data = validateOrThrow(RequestRideSchema, payload);
    const rideId = randomUUID();

    const locked = await this.rideRequestStore.lock(passengerId, rideId);
    if (!locked) {
      throw APIError.failedPrecondition("Você já possui uma solicitação de corrida ativa.");
    }

    await this.rideEventPublisher.publishRideRequested({
      rideId,
      passengerId,
      origin: data.origin,
      destination: data.destination,
      timestamp: new Date().toISOString(),
    });
    return { rideId };
  }

  async cancelRide(passengerId: string, payload: { rideId: string }): Promise<void> {
    const { rideId } = validateOrThrow(CancelRideSchema, payload);

    const ride = await this.rideRepo.findActiveByIdAndClient(rideId, passengerId, [...ACTIVE_RIDE_STATUSES]);
    if (!ride) {
      throw APIError.notFound("Corrida não encontrada ou não está ativa.");
    }

    await this.rideRepo.updateToCancelled(rideId, "CLIENT");
    if (ride.driverId) {
      await this.driverStatusStore.setAvailable(ride.driverId);
    }

    await this.rideRequestStore.release(passengerId);

    await this.rideEventPublisher.publishRideCancelled({
      rideId,
      passengerId,
      timestamp: new Date().toISOString(),
    });
  }

  async cancelRideRequest(passengerId: string, rideId: string): Promise<void> {
    const lockedRideId = await this.rideRequestStore.getLockedRideId(passengerId);
    if (!lockedRideId) {
      throw APIError.notFound("Nenhuma solicitação de corrida ativa encontrada.");
    }
    if (lockedRideId !== rideId) {
      throw APIError.notFound("O ID da corrida não corresponde à solicitação ativa.");
    }

    await this.rideRequestStore.release(passengerId);

    await this.rideEventPublisher.publishRideCancelled({
      rideId,
      passengerId,
      timestamp: new Date().toISOString(),
    });
  }
}

export const userService = new UserService(
  userRepository,
  sessionStore,
  userCache,
  rideRepository,
  rideRequestStore,
  driverStatusStore,
  rideEventPublisher,
  profileService,
);
