export type OperationalRegion = "am-manaus" | "am-interior";

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
