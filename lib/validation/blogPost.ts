import { z } from "zod";

export const createBlogPostSchema = z.object({
  title: z.string().min(1, "Title is required."),
  slug: z.string().min(1, "Slug is required.").regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase, alphanumeric, hyphen-separated."),
  content: z.string().min(1, "Content is required."),
  coverImageUrl: z.string().url().optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional().default("DRAFT"),
});
export type CreateBlogPostInput = z.infer<typeof createBlogPostSchema>;
