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

/**
 * A full, street-level address — distinct from `locationSchema` above,
 * which is deliberately loose (city/state level) for region
 * matching/search (serviceRegions, errand/RFQ/catalog locations). This is
 * for "where this account actually is": AccountProfile.address and
 * AccountProfile.businessAddress, required at sign-up.
 */
export const addressSchema = z.object({
  addressLine1: z.string().min(1, "Address line 1 is required."),
  addressLine2: z.string().optional(),
  city: z.string().min(1, "City is required."),
  state: z.string().min(1, "State/county/region is required."),
  postalCode: z.string().min(1, "Postal code is required."),
  country: z.string().min(1, "Country is required."),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

export type AddressInput = z.infer<typeof addressSchema>;

/** A single uploaded verification document, paired with a human label. */
export const verificationDocumentSchema = z.object({
  title: z.string().min(1, "Document title is required."),
  url: z.string().url(),
});

export type VerificationDocumentInput = z.infer<typeof verificationDocumentSchema>;
