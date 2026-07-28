import { APIError } from "encore.dev/api";
import { hash, compare } from "bcrypt";
import { validateOrThrow } from "@/validations/schema-validator";
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
import type { IDriverCredentialRepository } from "@/contracts/IDriverCredentialRepository";
import type { IDriverRepository } from "@/contracts/IDriverRepository";
import type { DriverProfileResponse } from "@/dto/driver.interface";
import type { IRideRepository, RideDetailedRow } from "@/contracts/IRideRepository";
import type { IDriverLocationCache } from "@/contracts/IDriverLocationCache";
import type { IDriverStatusStore } from "@/contracts/IDriverStatusStore";
import type { IRideRequestStore } from "@/contracts/IRideRequestStore";
import type { IRideEventPublisher } from "@/contracts/IRideEventPublisher";
import { driverRepository } from "@/repositories/driver.repository";
import { driverCredentialRepository } from "@/repositories/driver-credential.repository";
import { rideRepository } from "@/repositories/ride.repository";
import { driverLocationCache } from "@/infra/cache/driver-location-cache";
import { driverStatusStore } from "@/infra/cache/driver-status-store";
import { rideRequestStore } from "@/infra/cache/ride-request-store";
import { rideEventPublisher } from "@/infra/rabbitmq/ride-event-publisher";
import type { UpdateDriverLocationDTO } from "@/dto/driver.interface";
import type { AcceptOfferDTO, CompleteRideDTO, CancelRideParams, ActiveRideResponse } from "@/dto/driver.interface";
import { haversineDistance } from "@/utils/geo";
import { isPgUniqueViolation } from "@/constants/database";
import { COMPLETION_RADIUS_METERS } from "@/constants/ride";

export class DriverService {
  constructor(
    private readonly credentialRepo: IDriverCredentialRepository,
    private readonly driverRepo: IDriverRepository,
    private readonly rideRepo: IRideRepository,
    private readonly driverLocationCache: IDriverLocationCache,
    private readonly driverStatusStore: IDriverStatusStore,
    private readonly rideRequestStore: IRideRequestStore,
    private readonly rideEventPublisher: IRideEventPublisher,
  ) {}

  async register(payload: RegisterDriverDTO): Promise<{ id: string }> {
    const validated = validateOrThrow(RegisterDriverSchema, payload);

    const hashedPassword = await hash(validated.password, 10);
    try {
      const driver = await this.driverRepo.create({ fullName: validated.fullName });

      await this.credentialRepo.create({
        driverId: driver.id,
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
    return updated;
  }

  async changePassword(driverId: string, payload: ChangePasswordDTO): Promise<void> {
    const { currentPassword, newPassword } = validateOrThrow(ChangeDriverPasswordSchema, payload);

    const cred = await this.credentialRepo.findByDriverId(driverId);
    if (!cred) throw APIError.notFound("Motorista não encontrado.");

    const valid = await compare(currentPassword, cred.password);
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

    await Promise.all([
      this.driverStatusStore.setAvailable(driverId),
      this.rideRequestStore.release(ride.clientId),
    ]);

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

    const distance = haversineDistance(
      latitude,
      longitude,
      ride.destination.lat,
      ride.destination.lng,
    );

    if (distance > COMPLETION_RADIUS_METERS) {
      throw APIError.failedPrecondition(
        `Você precisa estar a menos de ${COMPLETION_RADIUS_METERS}m do destino para concluir a corrida.`,
      );
    }

    const updated = await this.rideRepo.updateToCompleted(rideId);

    await Promise.all([
      this.driverStatusStore.setAvailable(driverId),
      this.rideRequestStore.release(ride.clientId),
    ]);

    return { ride: updated };
  }
}

export const driverService = new DriverService(
  driverCredentialRepository,
  driverRepository,
  rideRepository,
  driverLocationCache,
  driverStatusStore,
  rideRequestStore,
  rideEventPublisher,
);
