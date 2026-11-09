import type { DriverMeResponse, DriverRegisterResponse } from "@/dto/driver.dto";
import type { DriverProfileWithUser } from "@/repositories/driver/driver.types";

export function toDriverRegisterResponse(profile: DriverProfileWithUser): DriverRegisterResponse {
  return {
    id: profile.id,
    fullName: profile.fullName,
    email: profile.email,
    phone: profile.phone,
    cpf: profile.cpf,
    accountStatus: profile.accountStatus,
    driverStatus: profile.driverStatus,
    createdAt: profile.createdAt.toISOString(),
  };
}

export function toDriverMeResponse(profile: DriverProfileWithUser): DriverMeResponse {
  return {
    id: profile.id,
    fullName: profile.fullName,
    email: profile.email,
    phone: profile.phone,
    cpf: profile.cpf,
    accountStatus: profile.accountStatus,
    driverStatus: profile.driverStatus,
  };
}
