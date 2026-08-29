export type Role = "CLIENT" | "ADMIN" | "EMPLOYEE";
export type UserStatus = "ACTIVE" | "BANNED" | "INACTIVE";
export type DriverStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED" | "BANNED";
export type RideStatus = "DRIVER_ASSIGNED" | "DRIVER_ARRIVING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface CancelRideParams {
  rideId: string;
}
