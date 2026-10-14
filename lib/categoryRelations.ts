import prisma from "./prisma";

/** Finds the relation row between two categories, regardless of which was stored as A vs B. */
export async function findCategoryRelation(categoryId1: string, categoryId2: string) {
  return prisma.relatedJobCategory.findFirst({
    where: {
      OR: [
        { categoryAId: categoryId1, categoryBId: categoryId2 },
        { categoryAId: categoryId2, categoryBId: categoryId1 },
      ],
    },
  });
}

/** Every category related to the given one, as full JobCategory records. */
export async function getRelatedCategories(categoryId: string) {
  const rows = await prisma.relatedJobCategory.findMany({
    where: { OR: [{ categoryAId: categoryId }, { categoryBId: categoryId }] },
  });
  const otherIds = rows.map((r) => (r.categoryAId === categoryId ? r.categoryBId : r.categoryAId));
  if (otherIds.length === 0) return [];
  return prisma.jobCategory.findMany({ where: { id: { in: otherIds } } });
}

/** Just the ids — used by lib/feed.ts, where the full records aren't needed. */
export async function getRelatedCategoryIds(categoryId: string): Promise<string[]> {
  const rows = await prisma.relatedJobCategory.findMany({
    where: { OR: [{ categoryAId: categoryId }, { categoryBId: categoryId }] },
    select: { categoryAId: true, categoryBId: true },
  });
  return rows.map((r) => (r.categoryAId === categoryId ? r.categoryBId : r.categoryAId));
}
