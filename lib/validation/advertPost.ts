import { z } from "zod";

export const createAdvertPostSchema = z.object({
  title: z.string().min(1, "Title is required."),
  imageUrl: z.string().url(),
  linkUrl: z.string().url().optional(),
  placement: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  isActive: z.boolean().optional().default(true),
});
export type CreateAdvertPostInput = z.infer<typeof createAdvertPostSchema>;
