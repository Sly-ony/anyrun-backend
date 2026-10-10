import { z } from "zod";

// Payouts are manual (an admin pays out by bank transfer — see
// POST /api/admin/withdrawals/{id}/complete), so this is just a saved bank
// account record; no payment gateway is involved or needs registering with.
export const createPayoutMethodSchema = z.object({
  accountName: z.string().min(1, "Account name is required."),
  accountNumber: z.string().min(1, "Account number is required."),
  bankCode: z.string().min(1, "Sort code is required."), // UK sort code, e.g. "20-00-00"
  bankName: z.string().min(1, "Bank name is required."),
  currency: z.string().min(3).max(3).optional().default("GBP"),
  isDefault: z.boolean().optional().default(false),
});
export type CreatePayoutMethodInput = z.infer<typeof createPayoutMethodSchema>;
