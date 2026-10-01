import { z } from "zod";
import { locationSchema } from "./shared";

export const createCatalogItemSchema = z.object({
  title: z.string().min(1, "Title is required."),
  description: z.string().optional(),
  category: z.string().min(1, "Category is required."),
  price: z.number().nonnegative("Price cannot be negative."),
  currency: z.string().min(3).max(3).optional(),
  photos: z.array(z.string().url()).optional(),
  region: locationSchema,
  isAvailable: z.boolean().optional(),
});
export type CreateCatalogItemInput = z.infer<typeof createCatalogItemSchema>;

export const updateCatalogItemSchema = createCatalogItemSchema.partial();
export type UpdateCatalogItemInput = z.infer<typeof updateCatalogItemSchema>;
