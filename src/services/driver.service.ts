import { APIError } from "encore.dev/api";
import { hash, compare } from "bcrypt";
import { generateToken, JWT_EXPIRES_IN } from "@/auth/auth";
import { validateOrThrow } from "@/validations/schema-validator";
import { SignInSchema, RefreshSchema } from "@/validations/dto/access.validate";
import {
  AcceptOfferSchema,
  CancelRideSchema,
  ChangeDriverPasswordSchema,
  CompleteRideSchema,
  RegisterDriverSchema,
  UpdateDriverLocationSchema,
  UpdateDriverProfileSchema,
} from "@/validations/dto/driver.validate";
import type { ChangePasswordDTO, RegisterDriverDTO, UpdateProfileDTO } from "@/dto/user.interface";
import type { SignInDTO, SignInResponse, RefreshDTO, RefreshResponse } from "@/dto/access.interface";
import type { IUserRepository } from "@/infra/drizzle/contracts/IUserRepository";
import type { IDriverRepository } from "@/infra/drizzle/contracts/IDriverRepository";
import type { DriverProfileResponse } from "@/dto/driver.interface";
import type { IRideRepository, RideDetailedRow } from "@/infra/drizzle/contracts/IRideRepository";
import type { ISessionStore } from "@/infra/redis/contracts/ISessionStore";
import type { IDriverCache } from "@/infra/redis/contracts/IDriverCache";
import type { IDriverLocationCache } from "@/infra/redis/contracts/IDriverLocationCache";
import type { IDriverStatusStore } from "@/infra/redis/contracts/IDriverStatusStore";
import type { IRideRequestStore } from "@/infra/redis/contracts/IRideRequestStore";
import type { IRideEventPublisher } from "@/infra/rabbitmq/contracts/IRideEventPublisher";
import { userRepository } from "@/infra/drizzle";
import { driverRepository } from "@/infra/drizzle";
import { rideRepository } from "@/infra/drizzle";
import { sessionStore } from "@/infra/redis";
import { driverCache } from "@/infra/redis";
import { driverLocationCache } from "@/infra/redis";
import { driverStatusStore } from "@/infra/redis";
import { rideRequestStore } from "@/infra/redis";
import { rideEventPublisher } from "@/infra/rabbitmq";
import type { UpdateDriverLocationDTO } from "@/dto/driver.interface";
import type { AcceptOfferDTO, CompleteRideDTO, CancelRideParams, ActiveRideResponse } from "@/dto/driver.interface";
import { haversineDistance } from "@/utils/geo";
import { isPgUniqueViolation } from "@/constants/database";
import { COMPLETION_RADIUS_METERS } from "@/constants/ride";

export class DriverService {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly driverRepo: IDriverRepository,
    private readonly rideRepo: IRideRepository,
    private readonly driverLocationCache: IDriverLocationCache,
    private readonly driverStatusStore: IDriverStatusStore,
    private readonly rideRequestStore: IRideRequestStore,
    private readonly rideEventPublisher: IRideEventPublisher,
    private readonly sessionStore: ISessionStore,
    private readonly driverCacheService: IDriverCache,
  ) {}

  async register(payload: RegisterDriverDTO): Promise<{ id: string }> {
    const validated = validateOrThrow(RegisterDriverSchema, payload);

    const hashedPassword = await hash(validated.password, 10);
    try {
      const driver = await this.driverRepo.create({
        fullName: validated.fullName,
        email: validated.email.toLowerCase(),
        password: hashedPassword,
      });

      return { id: driver.id };
    } catch (error: unknown) {
      if (isPgUniqueViolation(error)) {
        throw APIError.invalidArgument("E-mail já está em uso.");
      }
      throw APIError.internal("Erro ao registrar motorista.");
    }
  }

  async signIn(payload: SignInDTO): Promise<SignInResponse> {
    const validated = validateOrThrow(SignInSchema, payload);
    const { login, password } = validated;

    const driver = await this.driverRepo.findByEmail(login.toLowerCase());
    if (!driver) throw APIError.unauthenticated("E-mail ou senha inválidos.");

    const valid = await compare(password, driver.password);
    if (!valid) throw APIError.unauthenticated("E-mail ou senha inválidos.");

    const { sessionId, refreshToken } = await this.sessionStore.create({
      userId: driver.id,
      role: "DRIVER",
    });

    const accessToken = generateToken({ userID: driver.id, sessionID: sessionId });

    return { accessToken, refreshToken, sessionId, expiresIn: JWT_EXPIRES_IN };
  }

  async getMe(driverId: string): Promise<DriverProfileResponse> {
    const cached = await this.driverCacheService.getProfile<DriverProfileResponse>(driverId);
    if (cached) return cached;

    const profile = await this.driverRepo.findById(driverId);
    if (!profile) throw APIError.notFound("Motorista não encontrado.");

    await this.driverCacheService.setProfile(driverId, profile as unknown as Record<string, unknown>);

    return profile;
  }

  async logout(sessionId: string): Promise<void> {
    if (!sessionId) throw APIError.invalidArgument("Nenhuma sessão ativa.");
    await this.sessionStore.revoke(sessionId);
  }

  async logoutAll(driverId: string): Promise<void> {
    await this.sessionStore.revokeAll(driverId);
  }

  async refreshSession(sessionId: string, refreshToken: string): Promise<RefreshResponse> {
    const { refreshToken: newRefreshToken, userId } = await this.sessionStore.refresh(sessionId, refreshToken);

    const accessToken = generateToken({ userID: userId, sessionID: sessionId });

    return { accessToken, refreshToken: newRefreshToken, sessionId, expiresIn: JWT_EXPIRES_IN };
  }

  async getProfile(driverId: string): Promise<DriverProfileResponse> {
    const profile = await this.driverRepo.findById(driverId);
    if (!profile) throw APIError.notFound("Motorista não encontrado.");
    return profile;
  }

  async getRides(driverId: string): Promise<{ rides: RideDetailedRow[] }> {
    const result = await this.rideRepo.findByDriverId(driverId);
    return { rides: result };
  }

  async updateProfile(driverId: string, payload: UpdateProfileDTO): Promise<DriverProfileResponse> {
    const validated = validateOrThrow(UpdateDriverProfileSchema, payload);
    const updated = await this.driverRepo.updateProfile(driverId, validated);
    if (!updated) throw APIError.notFound("Motorista não encontrado.");
    await this.driverCacheService.invalidate(driverId);
    return updated;
  }

  async changePassword(driverId: string, payload: ChangePasswordDTO): Promise<void> {
    const { currentPassword, newPassword } = validateOrThrow(ChangeDriverPasswordSchema, payload);

    const driver = await this.driverRepo.findPasswordById(driverId);
    if (!driver) throw APIError.notFound("Motorista não encontrado.");

    const valid = await compare(currentPassword, driver.password);
    if (!valid) throw APIError.invalidArgument("Senha atual incorreta.");

    const hashed = await hash(newPassword, 10);
    await this.driverRepo.updatePassword(driverId, hashed);
  }

  async updateLocation(userID: string, payload: UpdateDriverLocationDTO): Promise<void> {
    const { latitude, longitude } = validateOrThrow(UpdateDriverLocationSchema, payload);
    await this.driverLocationCache.saveLocation(userID, latitude, longitude);
  }

  async goOnline(userID: string): Promise<void> {
    await this.driverLocationCache.goOnline(userID);
  }

  async goOffline(userID: string): Promise<void> {
    await this.driverLocationCache.goOffline(userID);
  }

  async getActiveRide(driverId: string): Promise<ActiveRideResponse> {
    const ride = await this.rideRepo.findActiveByDriverId(driverId);
    return { ride };
  }

  async acceptOffer(driverId: string, payload: AcceptOfferDTO): Promise<void> {
    const { rideId, offerId } = validateOrThrow(AcceptOfferSchema, payload);

    await this.rideEventPublisher.publishOfferAccepted({
      rideId,
      offerId,
      driverId,
      timestamp: new Date().toISOString(),
    });
  }

  async cancelRide(driverId: string, payload: CancelRideParams): Promise<void> {
    const { rideId } = validateOrThrow(CancelRideSchema, payload);
    const ride = await this.rideRepo.findActiveByIdAndDriver(rideId, driverId);
    if (!ride) {
      throw APIError.notFound("Corrida não encontrada ou não está ativa.");
    }

    await this.rideRepo.updateToCancelled(rideId);

    await Promise.all([this.driverStatusStore.setAvailable(driverId), this.rideRequestStore.release(ride.clientId)]);

    await this.rideEventPublisher.publishRideCancelled({
      rideId,
      passengerId: ride.clientId,
      timestamp: new Date().toISOString(),
    });
  }

  async completeRide(driverId: string, payload: CompleteRideDTO): Promise<ActiveRideResponse> {
    const { rideId, latitude, longitude } = validateOrThrow(CompleteRideSchema, payload);
    const ride = await this.rideRepo.findActiveByIdAndDriver(rideId, driverId);
    if (!ride) {
      throw APIError.notFound("Corrida não encontrada ou não está ativa.");
    }

    const distance = haversineDistance(latitude, longitude, ride.destination.lat, ride.destination.lng);

    if (distance > COMPLETION_RADIUS_METERS) {
      throw APIError.failedPrecondition(
        `Você precisa estar a menos de ${COMPLETION_RADIUS_METERS}m do destino para concluir a corrida.`,
      );
    }

    const updated = await this.rideRepo.updateToCompleted(rideId);

    await Promise.all([this.driverStatusStore.setAvailable(driverId), this.rideRequestStore.release(ride.clientId)]);

    return { ride: updated };
  }
}

export const driverService = new DriverService(
  userRepository,
  driverRepository,
  rideRepository,
  driverLocationCache,
  driverStatusStore,
  rideRequestStore,
  rideEventPublisher,
  sessionStore,
  driverCache,
);
