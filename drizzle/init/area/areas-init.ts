import * as fs from "fs";
import { sql } from "drizzle-orm";
import { db } from "@/infra/database/drizzle";
import { randomUUID } from "crypto";

// Interface completa para seu JSON do Amazonas
interface GeoJSONFeature {
  type: string;
  geometry: {
    type: string;
    coordinates: number[][][] | number[][][][]; // Polygon ou MultiPolygon
  };
  properties: {
    CD_MUN: string; // Código do município
    NM_MUN: string; // Nome do município
    CD_RGI: string; // Código da região geográfica imediata
    NM_RGI: string; // Nome da região geográfica imediata
    CD_RGINT: string; // Código da região geográfica intermediária
    NM_RGINT: string; // Nome da região geográfica intermediária
    CD_UF: string; // Código da UF
    NM_UF: string; // Nome da UF
    SIGLA_UF: string; // Sigla da UF
    CD_REGIA: string; // Código da região
    NM_REGIA: string; // Nome da região
    SIGLA_RG: string; // Sigla da região
    CD_CONCU: string; // Código do concursado (se houver)
    NM_CONCU: string; // Nome do concursado (se houver)
    AREA_KM2: number; // Área em km²
  };
}

interface GeoJSON {
  type: string;
  features: GeoJSONFeature[];
}

function geoJSONToWKT(geometry: { type: string; coordinates: any }): string {
  const { type, coordinates } = geometry;

  if (type === "Polygon") {
    // POLYGON((x1 y1, x2 y2, ...))
    const ring = coordinates[0];
    const points = ring.map((point: number[]) => `${point[0]} ${point[1]}`).join(", ");
    return `POLYGON((${points}))`;
  }

  if (type === "MultiPolygon") {
    // MULTIPOLYGON(((x1 y1, ...)), ((x1 y1, ...)))
    const polygons = coordinates
      .map((polygon: number[][][]) => {
        const ring = polygon[0];
        const points = ring.map((point: number[]) => `${point[0]} ${point[1]}`).join(", ");
        return `((${points}))`;
      })
      .join(", ");
    return `MULTIPOLYGON(${polygons})`;
  }

  throw new Error(`Tipo de geometria não suportado: ${type}`);
}

async function readGeoJSONFile(path: string) {
  console.log("📁 Lendo arquivo GeoJSON do Amazonas...");

  const rawData = fs.readFileSync(path, "utf-8");
  const geoData: GeoJSON = JSON.parse(rawData);

  console.log(`✅ Arquivo lido com ${geoData.features.length} municípios`);

  let insertedCount = 0;
  let errorCount = 0;

  for (const feature of geoData.features) {
    try {
      const props = feature.properties;

      console.log(`\n📌 Inserindo: ${props.NM_MUN} (${props.SIGLA_UF})`);

      // Converte para WKT
      const wkt = geoJSONToWKT(feature.geometry);

      const id = randomUUID();

      await db.execute(
        sql`INSERT INTO "areas" (id, municipality, "abbrev_state", geometry, "cd_mun", "cd_uf", "nm_uf", "cd_regia", "nm_regia") VALUES (${id}, ${props.NM_MUN}, ${props.SIGLA_UF}, ST_GeomFromText(${wkt}, 4674), ${props.CD_MUN}, ${props.CD_UF}, ${props.NM_UF}, ${props.CD_REGIA}, ${props.NM_REGIA})`,
      );

      insertedCount++;

      if (insertedCount % 10 === 0) {
        console.log(`🔄 Inseridos ${insertedCount} municípios...`);
      }
    } catch (error) {
      console.error("❌ Erro ao inserir:", error);
      errorCount++;
    }
  }

  console.log(`\n✅ Migração concluída!`);
  console.log(`📊 Total inserido: ${insertedCount} municípios`);
  console.log(`❌ Erros: ${errorCount}`);
}

async function main() {
  const filePath = "./drizzle/init/area/municipality_amazonas_zone.json";
  await readGeoJSONFile(filePath);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
