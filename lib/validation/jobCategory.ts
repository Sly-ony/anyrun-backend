import { z } from "zod";

export const createJobCategorySchema = z.object({
  name: z.string().min(1, "Name is required."),
  description: z.string().optional(),
  requiresVerification: z.boolean().optional().default(false),
});
export type CreateJobCategoryInput = z.infer<typeof createJobCategorySchema>;

export const updateJobCategorySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  requiresVerification: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateJobCategoryInput = z.infer<typeof updateJobCategorySchema>;
