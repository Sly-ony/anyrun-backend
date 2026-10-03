import { z } from "zod";

export const createDepositSchema = z.object({
  amount: z.number().positive("Amount must be greater than zero."),
  provider: z.enum(["PAYSTACK", "FLUTTERWAVE"]),
  currency: z.string().min(3).max(3).optional().default("GBP"),
});
export type CreateDepositInput = z.infer<typeof createDepositSchema>;

export const createWithdrawalSchema = z.object({
  amount: z.number().positive("Amount must be greater than zero."),
  payoutMethodId: z.string().min(1, "payoutMethodId is required."),
});
export type CreateWithdrawalInput = z.infer<typeof createWithdrawalSchema>;
