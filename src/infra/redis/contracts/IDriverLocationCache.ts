export interface IDriverLocationCache {
  saveLocation(driverId: string, latitude: number, longitude: number): Promise<void>;
  goOnline(driverId: string): Promise<void>;
  goOffline(driverId: string): Promise<void>;
  getStatus(driverId: string): Promise<string | null>;
}
