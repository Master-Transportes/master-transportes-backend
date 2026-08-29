import type { IBaseCache } from "./IBaseCache";

export interface IUserCache extends IBaseCache {
  getProfile<T>(userId: string): Promise<T | null>;
  setProfile(userId: string, profile: Record<string, unknown>): Promise<void>;
  invalidate(userId: string): Promise<void>;
}
