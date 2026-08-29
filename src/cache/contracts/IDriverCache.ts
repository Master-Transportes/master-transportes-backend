import type { IBaseCache } from "./IBaseCache";

export interface IDriverCache extends IBaseCache {
  getProfile<T>(driverId: string): Promise<T | null>;
  setProfile(driverId: string, profile: Record<string, unknown>): Promise<void>;
  invalidate(driverId: string): Promise<void>;
}
