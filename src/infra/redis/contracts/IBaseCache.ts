export interface IBaseCache {
  getBase(id: string): Promise<{ role: string; status: string } | null>;
  setBase(id: string, data: { role: string; status: string }): Promise<void>;
}
