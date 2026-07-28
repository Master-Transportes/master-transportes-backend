export type OperationalRegion = "am-manaus" | "am-interior";

const REGION_BY_CODE: Record<string, OperationalRegion> = {
  "1302603": "am-manaus",
};

export function resolveOperationalRegion(municipalityId: string, municipality: string): OperationalRegion {
  const byCode = REGION_BY_CODE[municipalityId];
  if (byCode) return byCode;
  if (municipality === "Manaus") return "am-manaus";
  return "am-interior";
}
