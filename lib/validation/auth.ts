import { z } from "zod";
import { locationSchema, addressSchema } from "./shared";

// Re-exported for backward compatibility with anything importing it from here.
export { locationSchema };

const serviceIntentSchema = z.enum(["PROVIDE_SERVICE", "NEED_SERVICE"]);

// Step 1 of registration (basic information only). Identical for individual
// and business; the endpoint decides accountKind. Business name/address/
// documents come in step 2, VAT/insurance in step 3.
export const registerSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  phone: z.string().min(7).optional(),
  password: z.string().min(8, "Password must be at least 8 characters."),
  name: z.string().min(1, "Name is required."),
  intent: serviceIntentSchema,
  address: addressSchema,
  serviceRegions: z.array(locationSchema).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

export type LoginInput = z.infer<typeof loginSchema>;