import { z } from "zod";
import { locationSchema, addressSchema } from "./shared";

export const updateAccountSchema = z.object({
  name: z.string().min(1).optional(),
  avatarUrl: z.string().url().optional(),
  phone: z.string().min(7).optional(),
  address: addressSchema.optional(),
  businessName: z.string().min(1).optional(),
  businessAddress: addressSchema.optional(),
  serviceRegions: z.array(locationSchema).optional(),
});
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
