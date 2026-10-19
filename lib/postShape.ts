import type { Prisma } from "@prisma/client";
import { asAddress } from "./json";

export const POST_INCLUDE = {
  category: { select: { id: true, name: true } },
  author: {
    select: {
      id: true,
      accountKind: true,
      businessName: true,
      businessAddress: true,
      user: { select: { name: true, avatarUrl: true } },
    },
  },
} satisfies Prisma.PostInclude;

export type PostWithRelations = Prisma.PostGetPayload<{ include: typeof POST_INCLUDE }>;

/** Public-safe post shape: category name + a small author card (city/state only, never the street address). */
export function shapePost(p: PostWithRelations) {
  const { author, category, ...rest } = p;
  const a = author.businessAddress ? asAddress(author.businessAddress) : null;
  return {
    ...rest,
    category: { id: category.id, name: category.name },
    author: {
      id: author.id,
      name: author.user.name,
      avatarUrl: author.user.avatarUrl,
      accountKind: author.accountKind,
      businessName: author.businessName,
      businessLocation: a ? { country: a.country, state: a.state, city: a.city } : null,
    },
  };
}