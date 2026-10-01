import { z } from "zod";
import { locationSchema } from "./shared";

// Deliberately excludes CLEANING_PROVIDER: that role is admin-designated and
// singleton (see the founder's exclusive cleaning vertical), never chosen at
// public sign-up. Enforced here at the schema level, in addition to the
// admin-only assignment endpoint we'll build separately.
export const PUBLIC_ACCOUNT_TYPES = [
  "INDIVIDUAL_CUSTOMER",
  "RUNNER",
  "BUSINESS_BUYER",
  "BUSINESS_SUPPLIER",
] as const;

export const publicAccountTypeSchema = z.enum(PUBLIC_ACCOUNT_TYPES);

// Re-exported for backward compatibility with anything importing it from here.
export { locationSchema };

const BUSINESS_ROLES = new Set(["BUSINESS_BUYER", "BUSINESS_SUPPLIER"]);
const REGION_AWARE_ROLES = new Set(["RUNNER", "BUSINESS_SUPPLIER"]);

export const signupSchema = z
  .object({
    email: z.string().email("Enter a valid email address."),
    phone: z.string().min(7).optional(),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters."),
    name: z.string().min(1, "Name is required."),
    roles: z
      .array(publicAccountTypeSchema)
      .min(1, "Select at least one account type.")
      .refine((r) => new Set(r).size === r.length, {
        message: "Duplicate roles are not allowed.",
      }),
    businessName: z.string().min(1).optional(),
    // Regions this account operates in — mainly relevant for RUNNER and
    // BUSINESS_SUPPLIER, who need to be matched to requests by region.
    serviceRegions: z.array(locationSchema).optional(),
  })
  .refine(
    (data) => !data.roles.some((r) => BUSINESS_ROLES.has(r)) || !!data.businessName,
    {
      message: "businessName is required for BUSINESS_BUYER or BUSINESS_SUPPLIER roles.",
      path: ["businessName"],
    }
  )
  .refine(
    (data) =>
      !data.roles.some((r) => REGION_AWARE_ROLES.has(r)) ||
      (data.serviceRegions && data.serviceRegions.length > 0),
    {
      message: "serviceRegions is required for RUNNER or BUSINESS_SUPPLIER roles.",
      path: ["serviceRegions"],
    }
  );

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

export type LoginInput = z.infer<typeof loginSchema>;
