import { APIError } from "encore.dev/api";
import { hash } from "bcrypt";
import { validateOrThrow } from "@/validations/schema-validator";
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
import type { IUserRepository } from "@/contracts/IUserRepository";
import type { IRideRepository } from "@/contracts/IRideRepository";
import type { IRideRequestStore } from "@/contracts/IRideRequestStore";
import type { IDriverStatusStore } from "@/contracts/IDriverStatusStore";
import type { IRideEventPublisher } from "@/contracts/IRideEventPublisher";
import type { ProfileService } from "@/services/profile.service";
import { userRepository } from "@/repositories/user.repository";
import { rideRepository } from "@/repositories/ride.repository";
import { rideRequestStore } from "@/infra/cache/ride-request-store";
import { driverStatusStore } from "@/infra/cache/driver-status-store";
import { rideEventPublisher } from "@/infra/rabbitmq/ride-event-publisher";
import { profileService } from "@/services/profile.service";
import { randomUUID } from "crypto";
import { isPgUniqueViolation } from "@/constants/database";

export class UserService {
  constructor(
    private readonly userRepo: IUserRepository,
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

  async getProfile(userID: string): Promise<UserProfileResponse> {
    return this.profileService_.getProfile(userID);
  }

  async getRides(userID: string): Promise<{ rides: RideSummary[] }> {
    const result = await this.rideRepo.findByClientId(userID);
    return { rides: result };
  }

  async updateProfile(userID: string, payload: UpdateProfileDTO): Promise<UserProfileResponse> {
    return this.profileService_.updateProfile(userID, payload, UpdateProfileSchema);
  }

  async changePassword(userID: string, payload: ChangePasswordDTO): Promise<void> {
    return this.profileService_.changePassword(userID, payload, ChangePasswordSchema);
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
  rideRepository,
  rideRequestStore,
  driverStatusStore,
  rideEventPublisher,
  profileService,
);
