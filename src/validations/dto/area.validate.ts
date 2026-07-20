import { z } from "zod";

export const GetRegionSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export type GetRegionDTO = z.infer<typeof GetRegionSchema>;
