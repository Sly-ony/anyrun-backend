import { z } from "zod";
import { addressSchema, locationSchema, verificationDocumentSchema } from "./shared";
import { providerVerificationSchema } from "./onboarding";

// Reuse the UK VAT validation from onboarding. Both VAT and insurance are
// optional here: the admin vouches for the business.
const vatNumber = providerVerificationSchema.shape.vatNumber.optional();
const insuranceDocumentUrl = z.string().url("insuranceDocumentUrl must be a valid URL.").optional();

// One admin form: basic details + business details.
export const createBusinessSchema = z.object({
  // basic details (-> User)
  name: z.string().min(1, "Name is required."),
  email: z.string().email("Enter a valid email address."),
  phone: z.string().min(7).optional(),
  password: z.string().min(8, "Password must be at least 8 characters."),
  avatarUrl: z.string().url().optional(),
  // personal address; defaults to the business address when omitted
  address: addressSchema.optional(),
  // business details (-> AccountProfile)
  businessName: z.string().min(1, "Business name is required."),
  businessAddress: addressSchema,
  serviceRegions: z.array(locationSchema).optional(),
  vatNumber,
  insuranceDocumentUrl,
  // supporting documents (-> auto-approved Verification)
  documents: z.array(verificationDocumentSchema).optional(),
  isCleaningProvider: z.boolean().default(false),
});

export const updateBusinessSchema = z
  .object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(7).optional(),
    password: z.string().min(8).optional(), // admin resets the password
    avatarUrl: z.string().url().optional(),
    address: addressSchema.optional(),
    businessName: z.string().min(1).optional(),
    businessAddress: addressSchema.optional(),
    serviceRegions: z.array(locationSchema).optional(),
    vatNumber,
    insuranceDocumentUrl,
    isCleaningProvider: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Send at least one field to update." });

export const addBusinessDocumentsSchema = z.object({
  documents: z.array(verificationDocumentSchema).min(1, "At least one document is required."),
  notes: z.string().optional(),
});