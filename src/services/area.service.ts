import { GetRegionPayload, GetRegionResponse, OperationalRegion } from "@/dto/area.interface";
import { GetRegionSchema } from "@/validations/dto/area.validate";
import { validateOrThrow } from "@/validations/schema-validator";
import type { IAreaRepository } from "@/contracts/IAreaRepository";
import { areaRepository } from "@/repositories/area.repository";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeRegionId(abbrevState: string, municipality: string): string {
  return `${abbrevState.toLowerCase()}-${slugify(municipality)}`;
}

export function resolveOperationalRegion(municipalityId: string, municipality: string): OperationalRegion {
  if (municipalityId === "1302603" || municipality === "Manaus") return "am-manaus";
  return "am-interior";
}

const DEFAULT_REGION: GetRegionResponse = {
  areaId: "unknown",
  municipalityId: "unknown",
  municipality: "Unknown",
  abbrevState: "AM",
  regionId: "am-interior",
  operationalRegion: "am-interior",
};

export class AreaService {
  constructor(private readonly areaRepo: IAreaRepository) {}

  async getRegion(payload: GetRegionPayload): Promise<GetRegionResponse> {
    const validated = validateOrThrow(GetRegionSchema, payload);
    const row = await this.areaRepo.findByCoordinates(validated.lat, validated.lng);

    if (!row) {
      return DEFAULT_REGION;
    }

    return {
      areaId: row.cdMun,
      municipalityId: row.cdMun,
      municipality: row.municipality,
      abbrevState: row.abbrevState,
      regionId: makeRegionId(row.abbrevState, row.municipality),
      operationalRegion: resolveOperationalRegion(row.cdMun, row.municipality),
    };
  }
}

export const areaService = new AreaService(areaRepository);
