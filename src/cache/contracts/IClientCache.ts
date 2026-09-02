import type { IBaseCache } from "./IBaseCache";

export interface IClientCache extends IBaseCache {
  getProfile<T>(clientId: string): Promise<T | null>;
  setProfile(clientId: string, profile: Record<string, unknown>): Promise<void>;
  invalidate(clientId: string): Promise<void>;
}
