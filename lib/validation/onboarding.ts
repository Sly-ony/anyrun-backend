import { z } from "zod";
import { addressSchema, verificationDocumentSchema } from "./shared";

// Step 2 (business accounts)
export const businessDetailsSchema = z.object({
  businessName: z.string().min(1, "Business name is required."),
  businessAddress: addressSchema,
  documents: z
    .array(verificationDocumentSchema)
    .min(1, "At least one business registration document is required."),
  notes: z.string().optional(),
});

// Step 3 (providers). UK VAT: "GB" + 9 or 12 digits (spaces allowed).
export const providerVerificationSchema = z.object({
  vatNumber: z
    .string()
    .transform((v) => v.replace(/\s+/g, "").toUpperCase())
    .refine((v) => /^GB(\d{9}|\d{12})$/.test(v), {
      message: "Enter a valid UK VAT number, e.g. GB123456789.",
    }),
  insuranceDocumentUrl: z.string().url("insuranceDocumentUrl must be a valid URL."),
});