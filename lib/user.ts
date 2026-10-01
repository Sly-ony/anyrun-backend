import type { User } from "@prisma/client";

export function sanitizeUser(user: User) {
  const { passwordHash, oauthId, ...safe } = user;
  return safe;
}
