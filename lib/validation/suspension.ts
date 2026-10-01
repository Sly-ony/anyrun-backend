import { z } from "zod";

export const suspendUserSchema = z.object({
  reason: z.string().min(1, "A suspension reason is required."),
});
export type SuspendUserInput = z.infer<typeof suspendUserSchema>;
