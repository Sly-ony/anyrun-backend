import { z } from "zod";
import { addressSchema, locationSchema } from "./shared";

// Everything a user may change about themselves. Email, password, account
// type, verification data and admin fields are NOT here, and strictObject
// rejects any field that isn't listed.
export const updateProfileSchema = z
  .strictObject({
    name: z.string().trim().min(1, "Name is required.").max(100).optional(),
    avatarUrl: z.string().url("Profile picture must be a valid URL.").optional(),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number.")
      .optional(),
    // "" or null clears the bio.
    bio: z
      .string()
      .trim()
      .max(500, "Keep your bio under 500 characters.")
      .nullable()
      .optional()
      .transform((v) => (v === undefined ? undefined : v === null || v === "" ? null : v)),
    address: addressSchema.optional(),
    // Business accounts only (checked in the route).
    businessName: z.string().trim().min(1, "Business name is required.").max(150).optional(),
    businessAddress: addressSchema.optional(),
    serviceRegions: z.array(locationSchema).max(30).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Send at least one field to change." });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;