import { z } from "zod";

export const grantAdminRoleSchema = z.object({
  email: z.string().email(),
  role: z.enum(["EDITOR", "SUPPORT", "DEVELOPER"]), // SUPER_ADMIN is never grantable via API — see docs/ADMIN_API.md
});
export type GrantAdminRoleInput = z.infer<typeof grantAdminRoleSchema>;
