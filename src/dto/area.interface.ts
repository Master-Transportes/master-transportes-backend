import type { OperationalRegion } from "@/constants/regions";
export type { OperationalRegion };

export const OPERATIONAL_REGIONS: OperationalRegion[] = ["am-manaus", "am-interior"];

export interface GetRegionPayload {
  lat: number;
  lng: number;
}

export interface GetRegionResponse {
  areaId: string;
  municipalityId: string;
  municipality: string;
  abbrevState: string;
  regionId: string;
  operationalRegion: OperationalRegion;
}
