import { z } from "zod";
import { locationSchema } from "./shared";

export const createPostSchema = z.object({
  type: z.enum(["NEED", "OFFER"]),
  categoryId: z.string().min(1, "categoryId is required."),
  title: z.string().min(1, "Title is required."),
  description: z.string().min(1, "Description is required."),
  tags: z.array(z.string().min(1)).optional(),
  location: locationSchema,
});
export type CreatePostInput = z.infer<typeof createPostSchema>;

export const updatePostSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).optional(),
  location: locationSchema.optional(),
  status: z.enum(["OPEN", "CLOSED"]).optional(),
});
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
