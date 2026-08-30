import { APIError } from "encore.dev/api";
import { hash, compare } from "bcrypt";
import { generateToken, JWT_EXPIRES_IN } from "@/auth/auth";
import { validateOrThrow } from "@/validations/schema-validator";
import { SignInSchema, RefreshSchema } from "@/validations/dto/access.validate";
import {
  AcceptOfferSchema,
  RejectOfferSchema,
  CancelRideSchema,
  ChangeDriverPasswordSchema,
  CompleteRideSchema,
  RegisterDriverSchema,
  UpdateDriverLocationSchema,
  UpdateDriverProfileSchema,
} from "@/validations/dto/driver.validate";
import type { ChangePasswordDTO, RegisterDriverDTO, UpdateProfileDTO } from "@/dto/user.interface";
import type { SignInDTO, SignInResponse, RefreshResponse } from "@/dto/access.interface";
import type { IDriverRepository } from "@/repositories/contracts/IDriverRepository";
import type { DriverProfileResponse, RideDetailedInfo } from "@/dto/driver.interface";
import type { IRideRepository } from "@/repositories/contracts/IRideRepository";
import type { ISessionStore } from "@/cache/contracts/ISessionStore";
import type { IDriverCache } from "@/cache/contracts/IDriverCache";
import type { IDriverLocationCache } from "@/cache/contracts/IDriverLocationCache";
import type { IDriverStatusStore } from "@/cache/contracts/IDriverStatusStore";
import type { IRideRequestStore } from "@/cache/contracts/IRideRequestStore";
import type { IRideEventPublisher } from "@/messaging/contracts/IRideEventPublisher";
import { driverRepository } from "@/repositories";
import { rideRepository } from "@/repositories";
import { sessionStore } from "@/cache";
import { sessionRepository } from "@/repositories";
import { driverCache } from "@/cache";
import { driverLocationCache } from "@/cache";
import { driverStatusStore } from "@/cache";
import { rideRequestStore } from "@/cache";
import { rideEventPublisher } from "@/messaging";
import type { UpdateDriverLocationDTO } from "@/dto/driver.interface";
import type {
  AcceptOfferDTO,
  RejectOfferDTO,
  CompleteRideDTO,
  CancelRideParams,
  ActiveRideResponse,
  DriverStatusResponse,
} from "@/dto/driver.interface";
import { haversineDistance } from "@/utils/geo";
import { isPgUniqueViolation } from "@/utils/database";
import type { SessionMetadata } from "@/cache/contracts/ISessionStore";
import { ACTIVE_RIDE_STATUSES, COMPLETION_RADIUS_METERS } from "@/constants/ride";

export class DriverService {
  constructor(
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

  async signIn(payload: SignInDTO, metadata?: SessionMetadata): Promise<SignInResponse> {
    const validated = validateOrThrow(SignInSchema, payload);
    const { email, password } = validated;

    const driver = await this.driverRepo.findByEmail(email.toLowerCase());
    if (!driver) throw APIError.unauthenticated("E-mail ou senha inválidos.");

    const valid = await compare(password, driver.password);
    if (!valid) throw APIError.unauthenticated("E-mail ou senha inválidos.");

    const { sessionId, refreshToken } = await this.sessionStore.create({
      userId: driver.id,
      userType: "DRIVER",
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
      deviceId: validated.deviceId,
    });

    const accessToken = generateToken({ sub: driver.id, sid: sessionId, role: "DRIVER" });

    return { accessToken, refreshToken, expiresIn: JWT_EXPIRES_IN, deviceId: validated.deviceId };
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

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await sessionRepository.findById(sessionId);
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

    if (session.userType !== "DRIVER") {
      throw APIError.permissionDenied("Sessão não pertence a um motorista.");
    }

    const driver = await this.driverRepo.findByIdWithStatus(session.userId);
    if (!driver) {
      throw APIError.notFound("Motorista não encontrado.");
    }
    if (driver.status !== "APPROVED") {
      throw APIError.permissionDenied("Motorista não está aprovado.");
    }

    const newRefreshToken = await this.sessionStore.rotateRefreshToken(
      session.id,
      validated.refreshToken,
    );
    if (!newRefreshToken) {
      throw APIError.unauthenticated("Falha ao rotacionar token.");
    }

    const accessToken = generateToken({ sub: session.userId, sid: session.id, role: "DRIVER" });

    return { accessToken, refreshToken: newRefreshToken, expiresIn: JWT_EXPIRES_IN };
  }

  async getRides(driverId: string): Promise<{ rides: RideDetailedInfo[] }> {
    const rows = await this.rideRepo.findByDriverId(driverId);
    const rides: RideDetailedInfo[] = rows.map(row => ({
      id: row.id,
      clientId: row.clientId,
      driverId: row.driverId,
      origin: row.origin,
      destination: row.destination,
      regionId: row.regionId,
      municipalityId: row.municipalityId,
      status: row.status,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      cancelledAt: row.cancelledAt,
      price: row.price,
      distance: row.distance,
      duration: row.duration,
      cancelledBy: row.cancelledBy,
      cancelReason: row.cancelReason,
      createdAt: row.createdAt,
      deletedAt: row.deletedAt,
    }));
    return { rides };
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

    await this.sessionStore.revokeAll(driverId);
  }

  async updateLocation(userID: string, payload: UpdateDriverLocationDTO): Promise<void> {
    const { latitude, longitude } = validateOrThrow(UpdateDriverLocationSchema, payload);
    await this.driverLocationCache.saveLocation(userID, latitude, longitude);
  }

  async goOnline(userID: string): Promise<DriverStatusResponse> {
    await this.driverLocationCache.goOnline(userID);
    return this.getStatus(userID);
  }

  async goOffline(userID: string): Promise<DriverStatusResponse> {
    await this.driverLocationCache.goOffline(userID);
    return this.getStatus(userID);
  }

  async getActiveRide(driverId: string): Promise<ActiveRideResponse> {
    const ride = await this.rideRepo.findActiveByDriverId(driverId, [...ACTIVE_RIDE_STATUSES]);
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

  async rejectOffer(driverId: string, payload: RejectOfferDTO): Promise<void> {
    const { rideId, offerId } = validateOrThrow(RejectOfferSchema, payload);

    await this.rideEventPublisher.publishOfferRejected({
      rideId,
      offerId,
      driverId,
      timestamp: new Date().toISOString(),
    });
  }

  async getStatus(driverId: string): Promise<DriverStatusResponse> {
    const status = await this.driverLocationCache.getStatus(driverId);
    return {
      online: status === "available" || status === "busy",
    };
  }

  async cancelRide(driverId: string, payload: CancelRideParams): Promise<void> {
    const { rideId } = validateOrThrow(CancelRideSchema, payload);
    const ride = await this.rideRepo.findActiveByIdAndDriver(rideId, driverId, [...ACTIVE_RIDE_STATUSES]);
    if (!ride) {
      throw APIError.notFound("Corrida não encontrada ou não está ativa.");
    }

    await this.rideRepo.updateToCancelled(rideId, "DRIVER");

    await Promise.all([this.driverStatusStore.setAvailable(driverId), this.rideRequestStore.release(ride.clientId)]);

    await this.rideEventPublisher.publishRideCancelled({
      rideId,
      passengerId: ride.clientId,
      timestamp: new Date().toISOString(),
    });
  }

  async completeRide(driverId: string, payload: CompleteRideDTO): Promise<ActiveRideResponse> {
    const { rideId, latitude, longitude } = validateOrThrow(CompleteRideSchema, payload);
    const ride = await this.rideRepo.findActiveByIdAndDriver(rideId, driverId, [...ACTIVE_RIDE_STATUSES]);
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
    if (!updated) {
      throw APIError.notFound("Corrida não encontrada após a conclusão.");
    }

    await Promise.all([this.driverStatusStore.setAvailable(driverId), this.rideRequestStore.release(ride.clientId)]);

    return { ride: updated };
  }
}

export const driverService = new DriverService(
  driverRepository,
  rideRepository,
  driverLocationCache,
  driverStatusStore,
  rideRequestStore,
  rideEventPublisher,
  sessionStore,
  driverCache,
);
