import { z } from "zod";

export const quotationLineItemInputSchema = z.object({
  rfqItemId: z.string().optional(), // ties this line back to an RFQLineItem.itemId
  name: z.string().min(1, "Line item name is required."),
  price: z.number().nonnegative("Price cannot be negative."),
  notes: z.string().optional(),
  available: z.boolean().optional().default(true),
});

export const createQuotationSchema = z.object({
  lineItems: z.array(quotationLineItemInputSchema).min(1, "At least one priced line item is required."),
  // If omitted, we compute it as the sum of line item prices.
  totalPrice: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});
export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;

export const updateQuotationSchema = createQuotationSchema.partial();
export type UpdateQuotationInput = z.infer<typeof updateQuotationSchema>;
