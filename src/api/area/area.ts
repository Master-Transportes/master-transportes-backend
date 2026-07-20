import { api } from "encore.dev/api";
import { areaService } from "@/services/area.service";
import { GetRegionPayload, GetRegionResponse } from "@/interfaces/area.interface";

export const getRegion = api<GetRegionPayload, GetRegionResponse>(
  { expose: true, method: "GET", path: "/area/region", auth: true },
  async params => {
    return areaService.getRegion(params);
  },
);
