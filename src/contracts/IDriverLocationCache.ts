export interface IDriverLocationCache {
  updateLocation(driverId: string, latitude: number, longitude: number): Promise<void>;
}
