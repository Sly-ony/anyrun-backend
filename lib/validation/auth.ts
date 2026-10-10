import { z } from "zod";
import { locationSchema, addressSchema, verificationDocumentSchema } from "./shared";

// Re-exported for backward compatibility with anything importing it from here.
export { locationSchema };

const accountKindSchema = z.enum(["INDIVIDUAL", "BUSINESS"]);
const serviceIntentSchema = z.enum(["PROVIDE_SERVICE", "NEED_SERVICE"]);

// Sign-up asks two independent questions — accountKind and intent — rather
// than the client picking AccountType roles directly. See lib/roles.ts's
// deriveRoles for how those two map to the actual `roles` stored.
// CLEANING_PROVIDER is never reachable through this at all: that role is
// seeded directly into the database (see prisma/seed.ts), not chosen here.
export const signupSchema = z
  .object({
    email: z.string().email("Enter a valid email address."),
    phone: z.string().min(7).optional(),
    password: z.string().min(8, "Password must be at least 8 characters."),
    name: z.string().min(1, "Name is required."),
    accountKind: accountKindSchema,
    intent: serviceIntentSchema,
    // Every account provides a comprehensive address, regardless of kind or intent.
    address: addressSchema,
    // Required only when accountKind = BUSINESS.
    businessName: z.string().min(1).optional(),
    businessAddress: addressSchema.optional(),
    businessDocuments: z.array(verificationDocumentSchema).optional(),
    // Required only when intent = PROVIDE_SERVICE — the broad areas this
    // account operates in, as opposed to `address` above (where they are).
    serviceRegions: z.array(locationSchema).optional(),
  })
  .refine((data) => data.accountKind !== "BUSINESS" || !!data.businessName, {
    message: "businessName is required for a BUSINESS account.",
    path: ["businessName"],
  })
  .refine((data) => data.accountKind !== "BUSINESS" || !!data.businessAddress, {
    message: "businessAddress is required for a BUSINESS account.",
    path: ["businessAddress"],
  })
  .refine(
    (data) =>
      data.accountKind !== "BUSINESS" ||
      (data.businessDocuments && data.businessDocuments.length > 0),
    {
      message: "At least one businessDocument ({ title, url }) is required for a BUSINESS account.",
      path: ["businessDocuments"],
    }
  )
  .refine(
    (data) =>
      data.intent !== "PROVIDE_SERVICE" ||
      (data.serviceRegions && data.serviceRegions.length > 0),
    {
      message: "serviceRegions is required when intent is PROVIDE_SERVICE.",
      path: ["serviceRegions"],
    }
  );

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

export type LoginInput = z.infer<typeof loginSchema>;
