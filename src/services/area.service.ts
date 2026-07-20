import { sql } from "drizzle-orm";
import { areas } from "@/infra/db/schema";
import { GetRegionPayload, GetRegionResponse, OperationalRegion } from "@/interfaces/area.interface";
import { GetRegionSchema } from "@/validations/dto/area.validate";
import { validateOrThrow } from "@/validations/schema-validator";
import { DrizzleDatabase, drizzleDatabase } from "@/infra/adapters/drizzle-db.adapter";

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
  constructor(private readonly database: DrizzleDatabase) {}

  async getRegion(payload: GetRegionPayload): Promise<GetRegionResponse> {
    const validated = validateOrThrow(GetRegionSchema, payload);
    const rows = await this.database.db
      .select({
        cdMun: sql<string>`"cdMun"`,
        municipality: sql<string>`"municipality"`,
        abbrevState: sql<string>`"abbrevState"`,
      })
      .from(areas)
      .where(sql`ST_Contains(geometry, ST_SetSRID(ST_MakePoint(${validated.lng}, ${validated.lat}), 4674))`)
      .limit(1);

    if (rows.length === 0) {
      return DEFAULT_REGION;
    }

    const { cdMun, municipality, abbrevState } = rows[0];
    return {
      areaId: cdMun,
      municipalityId: cdMun,
      municipality,
      abbrevState,
      regionId: makeRegionId(abbrevState, municipality),
      operationalRegion: resolveOperationalRegion(cdMun, municipality),
    };
  }
}

export const areaService = new AreaService(drizzleDatabase);
