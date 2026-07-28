export interface IDriverStatusStore {
  setAvailable(driverId: string): Promise<void>;
}
