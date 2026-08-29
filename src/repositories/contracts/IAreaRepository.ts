export interface AreaRow {
  cdMun: string;
  municipality: string;
  abbrevState: string;
}

export interface IAreaRepository {
  findByCoordinates(lat: number, lng: number): Promise<AreaRow | null>;
}
