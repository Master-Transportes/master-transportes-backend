export interface IUserCache {
  getProfile<T>(userId: string): Promise<T | null>;
  setProfile(userId: string, profile: Record<string, unknown>): Promise<void>;
  setBase(userId: string, data: { role: string; status: string }): Promise<void>;
  invalidate(userId: string): Promise<void>;
}
