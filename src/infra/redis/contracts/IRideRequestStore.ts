export interface IRideRequestStore {
  lock(passengerId: string, rideId: string): Promise<boolean>;
  release(passengerId: string): Promise<void>;
  getLockedRideId(passengerId: string): Promise<string | null>;
}
