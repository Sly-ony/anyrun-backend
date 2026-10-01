import { z } from "zod";
import { locationSchema } from "./shared";

export const createErrandSchema = z.object({
  description: z.string().min(1, "Description is required."),
  category: z.string().min(1, "Category is required."),
  location: locationSchema,
  budget: z.number().nonnegative().optional(),
  photos: z.array(z.string().url()).optional(),
  deadline: z.coerce.date().optional(),
});
export type CreateErrandInput = z.infer<typeof createErrandSchema>;

// Same fields, all optional — used for PATCH while the request is still OPEN.
export const updateErrandSchema = createErrandSchema.partial();
export type UpdateErrandInput = z.infer<typeof updateErrandSchema>;

export const ERRAND_MANUAL_STATUSES = [
  "IN_PROGRESS",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
] as const;

export const errandStatusChangeSchema = z.object({
  status: z.enum(ERRAND_MANUAL_STATUSES),
});
