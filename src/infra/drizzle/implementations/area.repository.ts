import { sql } from "drizzle-orm";
import { areas } from "../schema";
import { db } from "../drizzle";
import type { IAreaRepository, AreaRow } from "../contracts/IAreaRepository";

export class AreaRepository implements IAreaRepository {
  async findByCoordinates(lat: number, lng: number): Promise<AreaRow | null> {
    const [row] = await db
      .select({
        cdMun: sql<string>`"cd_mun"`,
        municipality: sql<string>`"municipality"`,
        abbrevState: sql<string>`"abbrev_state"`,
      })
      .from(areas)
      .where(sql`ST_Contains(geometry, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4674))`)
      .limit(1);

    return row ?? null;
  }
}

export const areaRepository = new AreaRepository();
