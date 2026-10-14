import { z } from "zod";
import { verificationDocumentSchema } from "./shared";

// A runner selects the categories they want to work in. For any selected
// category that requires verification, documents must be supplied in the
// same call — "if he selects two that need verification, he has to verify
// the two" means both submissions happen together, not one at a time.
export const selectJobCategoriesSchema = z.object({
  jobCategoryIds: z.array(z.string().min(1)).min(1, "Select at least one job category."),
  // Keyed by jobCategoryId, only required for categories that need verification.
  verificationDocuments: z.record(z.string(), z.array(verificationDocumentSchema).min(1)).optional(),
});
export type SelectJobCategoriesInput = z.infer<typeof selectJobCategoriesSchema>;

export const submitBusinessVerificationSchema = z.object({
  documents: z.array(verificationDocumentSchema).min(1, "At least one document is required."),
  notes: z.string().optional(),
});
export type SubmitBusinessVerificationInput = z.infer<typeof submitBusinessVerificationSchema>;

export const reviewVerificationSchema = z
  .object({
    decision: z.enum(["APPROVED", "REJECTED"]),
    rejectionReason: z.string().optional(),
  })
  .refine((data) => data.decision !== "REJECTED" || !!data.rejectionReason, {
    message: "rejectionReason is required when rejecting a verification.",
    path: ["rejectionReason"],
  });
export type ReviewVerificationInput = z.infer<typeof reviewVerificationSchema>;
