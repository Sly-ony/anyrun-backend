import { z } from "zod";

export const locationSchema = z.object({
  country: z.string().min(1),
  state: z.string().min(1),
  city: z.string().min(1),
  area: z.string().optional(),
  postalCode: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

export type LocationInput = z.infer<typeof locationSchema>;

/** Minimal shape used for region-matching queries (state + city only). */
export type RegionLike = { state: string; city: string };
