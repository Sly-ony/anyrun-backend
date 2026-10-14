import { z } from "zod";

export const requestPasswordResetSchema = z.object({
  email: z.string().email(),
});

export const confirmPasswordResetSchema = z.object({
  token: z.string().min(1, "token is required."),
  newPassword: z.string().min(8, "Password must be at least 8 characters."),
});
