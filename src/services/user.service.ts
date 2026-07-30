import { APIError } from "encore.dev/api";
import { hash, compare } from "bcrypt";
import { generateToken, JWT_EXPIRES_IN } from "@/auth/auth";
import { validateOrThrow } from "@/validations/schema-validator";
import { SignInSchema, RefreshSchema } from "@/validations/dto/access.validate";
import {
  CancelRideSchema,
  ChangePasswordSchema,
  RegisterUserSchema,
  RequestRideSchema,
  UpdateProfileSchema,
} from "@/validations/dto/user.validate";
import type {
  CancelRideParams,
  ChangePasswordDTO,
  RegisterUserDTO,
  UpdateProfileDTO,
  UserProfileResponse,
  RideSummary,
  RequestRideResponse,
  RequestRideDTO,
} from "@/dto/user.interface";
import type { SignInDTO, SignInResponse, RefreshResponse, GetMeResponse } from "@/dto/access.interface";
import type { IUserRepository } from "@/infra/drizzle/contracts/IUserRepository";
import type { ISessionStore } from "@/infra/redis/contracts/ISessionStore";
import type { IUserCache } from "@/infra/redis/contracts/IUserCache";
import type { IRideRepository } from "@/infra/drizzle/contracts/IRideRepository";
import type { IRideRequestStore } from "@/infra/redis/contracts/IRideRequestStore";
import type { IDriverStatusStore } from "@/infra/redis/contracts/IDriverStatusStore";
import type { IRideEventPublisher } from "@/infra/rabbitmq/contracts/IRideEventPublisher";
import type { ProfileService } from "@/services/profile.service";
import { userRepository } from "@/infra/drizzle";
import { rideRepository } from "@/infra/drizzle";
import { rideRequestStore } from "@/infra/redis";
import { driverStatusStore } from "@/infra/redis";
import { rideEventPublisher } from "@/infra/rabbitmq";
import { sessionStore } from "@/infra/redis";
import { userCache } from "@/infra/redis";
import { profileService } from "@/services/profile.service";
import { randomUUID } from "crypto";
import { isPgUniqueViolation } from "@/constants/database";

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

  async signIn(payload: SignInDTO): Promise<SignInResponse> {
    const validated = validateOrThrow(SignInSchema, payload);
    const { login, password } = validated;

    const user = await this.userRepo.findByEmail(login.toLowerCase());
    if (!user) throw APIError.unauthenticated("E-mail ou senha inválidos.");
    if (user.role === "DRIVER") throw APIError.unauthenticated("E-mail ou senha inválidos.");

    const validPassword = await compare(password, user.password);
    if (!validPassword) throw APIError.unauthenticated("E-mail ou senha inválidos.");

    const { sessionId, refreshToken } = await this.sessionStore.create({
      userId: user.id,
      role: user.role as "DRIVER" | "CLIENT" | "ADMIN" | "EMPLOYEE",
    });

    const accessToken = generateToken({ userID: user.id, sessionID: sessionId });

    return { accessToken, refreshToken, sessionId, expiresIn: JWT_EXPIRES_IN };
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

  async logout(sessionId: string): Promise<void> {
    if (!sessionId) throw APIError.invalidArgument("Nenhuma sessão ativa.");
    await this.sessionStore.revoke(sessionId);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.sessionStore.revokeAll(userId);
  }

  async refreshSession(sessionId: string, refreshToken: string): Promise<RefreshResponse> {
    validateOrThrow(RefreshSchema, { refreshToken, sessionId });
    const { refreshToken: newRefreshToken, userId } = await this.sessionStore.refresh(sessionId, refreshToken);

    const accessToken = generateToken({ userID: userId, sessionID: sessionId });

    return { accessToken, refreshToken: newRefreshToken, sessionId, expiresIn: JWT_EXPIRES_IN };
  }

  async getUserSessions(userId: string): Promise<string[]> {
    return this.sessionStore.getUserSessionIds(userId);
  }

  async getProfile(userID: string): Promise<UserProfileResponse> {
    return this.profileService_.getProfile(userID);
  }

  async getRides(userID: string): Promise<{ rides: RideSummary[] }> {
    const result = await this.rideRepo.findByClientId(userID);
    return { rides: result };
  }

  async updateProfile(userID: string, payload: UpdateProfileDTO): Promise<UserProfileResponse> {
    return this.profileService_.updateProfile(userID, payload);
  }

  async changePassword(userID: string, payload: ChangePasswordDTO): Promise<void> {
    return this.profileService_.changePassword(userID, payload);
  }

  async requestRide(passengerId: string, payload: RequestRideDTO): Promise<RequestRideResponse> {
    const active = await this.rideRepo.findActiveByClientId(passengerId);
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
      pickupLat: data.pickupLat,
      pickupLng: data.pickupLng,
      dropoffLat: data.dropoffLat,
      dropoffLng: data.dropoffLng,
      originName: data.originName,
      destinationName: data.destinationName,
      timestamp: new Date().toISOString(),
    });
    return { rideId };
  }

  async cancelRide(passengerId: string, payload: CancelRideParams): Promise<void> {
    const { rideId } = validateOrThrow(CancelRideSchema, payload);

    const ride = await this.rideRepo.findActiveByIdAndClient(rideId, passengerId);
    if (!ride) {
      throw APIError.notFound("Corrida não encontrada ou não está ativa.");
    }

    await this.rideRepo.updateToCancelled(rideId);

    await Promise.all([
      this.driverStatusStore.setAvailable(ride.driverId),
      this.rideRequestStore.release(passengerId),
    ]);

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
