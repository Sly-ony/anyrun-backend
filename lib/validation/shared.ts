import { z } from "zod";

// Anyrun operates in the United Kingdom only. Country is optional on input
// (the app does not need to ask for it) and is always stored as "United Kingdom".
const UK_NAMES = [
  "united kingdom",
  "uk",
  "u.k.",
  "gb",
  "great britain",
  "britain",
  "england",
  "scotland",
  "wales",
  "northern ireland",
];

export const ukCountrySchema = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (v === undefined || v === "") return "United Kingdom";
    if (UK_NAMES.includes(v.toLowerCase())) return "United Kingdom";
    ctx.addIssue({ code: "custom", message: "Anyrun is only available in the United Kingdom." });
    return z.NEVER;
  });

const UK_POSTCODE = /^(GIR ?0AA|[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2})$/i;

/** Validates a full UK postcode and stores it as upper case with one space, e.g. "E1 6AN". */
export const ukPostcodeSchema = z
  .string()
  .trim()
  .min(1, "Postal code is required.")
  .refine((v) => UK_POSTCODE.test(v), "Enter a valid UK postcode, for example E1 6AN.")
  .transform((v) => {
    const compact = v.replace(/\s+/g, "").toUpperCase();
    return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
  });

export const locationSchema = z.object({
  country: ukCountrySchema,
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
  state: z.string().min(1, "County/region is required."),
  postalCode: ukPostcodeSchema,
  country: ukCountrySchema,
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