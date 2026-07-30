export interface DriverCredentialRow {
  id: string;
  driverId: string;
  email: string;
  password: string;
}

export interface CreateDriverCredentialData {
  driverId: string;
  email: string;
  password: string;
}

export interface IDriverCredentialRepository {
  findByEmail(email: string): Promise<DriverCredentialRow | null>;
  findByDriverId(driverId: string): Promise<DriverCredentialRow | null>;
  create(data: CreateDriverCredentialData): Promise<void>;
  updatePassword(driverId: string, password: string): Promise<void>;
}
