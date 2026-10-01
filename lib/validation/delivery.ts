import { z } from "zod";
import { locationSchema } from "./shared";

export const createDeliveryJobSchema = z
  .object({
    errandRequestId: z.string().min(1).optional(),
    relatedOrderId: z.string().min(1).optional(),
    pickupAddress: locationSchema,
    dropoffAddress: locationSchema,
    // The founder's delivery company quotes this fee outside the app for now
    // (e.g. via chat/dispatch) — no distance-based fee calculator yet.
    deliveryFee: z.number().nonnegative("Delivery fee cannot be negative."),
    scheduledAt: z.coerce.date().optional(),
  })
  .refine((data) => !!data.errandRequestId !== !!data.relatedOrderId, {
    message: "Provide exactly one of errandRequestId or relatedOrderId.",
  });
export type CreateDeliveryJobInput = z.infer<typeof createDeliveryJobSchema>;

export const DELIVERY_MANUAL_STATUSES = [
  "PICKED_UP",
  "IN_TRANSIT",
  "DELIVERED",
  "CANCELLED",
] as const;

export const deliveryStatusChangeSchema = z.object({
  status: z.enum(DELIVERY_MANUAL_STATUSES),
});
