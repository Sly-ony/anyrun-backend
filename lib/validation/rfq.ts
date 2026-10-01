import { z } from "zod";
import { locationSchema } from "./shared";

// itemId is always generated server-side (see the RFQ create route) so
// clients never have to coordinate unique IDs among line items themselves.
export const rfqLineItemInputSchema = z.object({
  name: z.string().min(1, "Line item name is required."),
  quantity: z.number().int().positive("Quantity must be at least 1."),
  notes: z.string().optional(),
});

export const createRfqSchema = z.object({
  title: z.string().optional(),
  lineItems: z.array(rfqLineItemInputSchema).min(1, "At least one line item is required."),
  region: locationSchema,
  deadline: z.coerce.date().optional(),
});
export type CreateRfqInput = z.infer<typeof createRfqSchema>;

export const updateRfqSchema = createRfqSchema.partial();
export type UpdateRfqInput = z.infer<typeof updateRfqSchema>;

export const awardRfqSchema = z.object({
  // An array so the buyer can award more than one supplier on the same RFQ
  // (e.g. splitting line items across suppliers), per the brief.
  quotationIds: z.array(z.string().min(1)).min(1, "Select at least one quotation to award."),
});
