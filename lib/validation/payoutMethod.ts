import { z } from "zod";

export const createPayoutMethodSchema = z.object({
  provider: z.enum(["PAYSTACK", "FLUTTERWAVE"]),
  accountName: z.string().min(1, "Account name is required."),
  accountNumber: z.string().min(1, "Account number is required."),
  bankCode: z.string().min(1, "Bank code is required."),
  bankName: z.string().min(1, "Bank name is required."),
  currency: z.string().min(3).max(3).optional().default("GBP"),
  isDefault: z.boolean().optional().default(false),
});
export type CreatePayoutMethodInput = z.infer<typeof createPayoutMethodSchema>;
