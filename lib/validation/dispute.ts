import { z } from "zod";

export const DISPUTE_RELATED_TYPES = [
  "ERRAND",
  "RFQ",
  "CATALOG_ORDER",
  "CLEANING_BOOKING",
  "DELIVERY_JOB",
  "OTHER",
] as const;

export const createDisputeSchema = z.object({
  relatedType: z.enum(DISPUTE_RELATED_TYPES),
  relatedId: z.string().optional(), // omit for OTHER or when there's no specific record to point at
  againstId: z.string().optional(), // the other party's AccountProfile.id, if any
  subject: z.string().min(1, "Subject is required."),
  description: z.string().min(1, "Description is required."),
});
export type CreateDisputeInput = z.infer<typeof createDisputeSchema>;

export const manageDisputeSchema = z.object({
  status: z.enum(["IN_REVIEW", "RESOLVED", "DISMISSED"]),
  resolutionNotes: z.string().optional(),
  assignedToId: z.string().optional(),
});
export type ManageDisputeInput = z.infer<typeof manageDisputeSchema>;
