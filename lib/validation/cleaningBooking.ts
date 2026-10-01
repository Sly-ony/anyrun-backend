import { z } from "zod";
import { locationSchema } from "./shared";

export const createCleaningBookingSchema = z.object({
  serviceScope: z.enum(["DOMESTIC", "COMMERCIAL"]),
  address: locationSchema,
  scheduledDate: z.coerce.date(),
  notes: z.string().optional(),
  // Optional at request time — the provider typically confirms a firm price
  // when they move the booking to CONFIRMED (see the status route).
  price: z.number().nonnegative().optional(),
});
export type CreateCleaningBookingInput = z.infer<typeof createCleaningBookingSchema>;

// Only what the customer may still change while PENDING.
export const updateCleaningBookingSchema = z.object({
  address: locationSchema.optional(),
  scheduledDate: z.coerce.date().optional(),
  notes: z.string().optional(),
});

export const CLEANING_MANUAL_STATUSES = [
  "CONFIRMED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;

export const cleaningStatusChangeSchema = z.object({
  status: z.enum(CLEANING_MANUAL_STATUSES),
  // The provider may attach/update the price at the moment they confirm.
  price: z.number().nonnegative().optional(),
});
