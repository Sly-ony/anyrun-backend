import prisma from "./prisma";
import { getRelatedCategoryIds } from "./categoryRelations";
import type { Post } from "@prisma/client";

// Easy to retune later — see docs/USER_API.md's Feed section for the
// rationale (sourced from the founder's description: "70% exact match, 25%
// peers/other side, 5% related").
const WEIGHTS = { primary: 0.7, secondary: 0.25, related: 0.05 };

export type FeedViewpoint = "PROVIDER" | "SEEKER";

export interface FeedResult extends Post {
  feedBucket: "primary" | "secondary" | "related";
}

function splitCounts(pageSize: number) {
  const primary = Math.round(pageSize * WEIGHTS.primary);
  const secondary = Math.round(pageSize * WEIGHTS.secondary);
  // Related absorbs the rounding remainder rather than its own Math.round,
  // so the three always sum exactly to pageSize.
  const related = Math.max(0, pageSize - primary - secondary);
  return { primary, secondary, related };
}

/**
 * Weighted round-robin interleave: at each step, picks whichever bucket has
 * contributed the least relative to its weight so far. Produces a properly
 * mixed sequence (not three stacked blocks) while still landing on
 * approximately the target 70/25/5 split by the end.
 */
function interleave(buckets: { items: Post[]; weight: number; bucket: FeedResult["feedBucket"] }[]): FeedResult[] {
  const result: FeedResult[] = [];
  const consumed = buckets.map(() => 0);
  const total = buckets.reduce((sum, b) => sum + b.items.length, 0);

  while (result.length < total) {
    let bestIndex = -1;
    let bestScore = Infinity;
    buckets.forEach((b, i) => {
      if (consumed[i] >= b.items.length) return;
      const score = (consumed[i] + 1) / b.weight;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    });
    if (bestIndex === -1) break;
    const bucket = buckets[bestIndex];
    result.push({ ...bucket.items[consumed[bestIndex]], feedBucket: bucket.bucket });
    consumed[bestIndex]++;
  }

  return result;
}

export interface GetFeedParams {
  categoryId: string;
  as: FeedViewpoint;
  viewerAccountProfileId: string;
  page: number;
  pageSize: number;
}

export interface FeedPage {
  items: FeedResult[];
  composition: { primary: number; secondary: number; related: number };
  page: number;
  pageSize: number;
}

export async function getWeightedFeed(params: GetFeedParams): Promise<FeedPage> {
  const { categoryId, as, viewerAccountProfileId, page, pageSize } = params;
  const counts = splitCounts(pageSize);
  // Approximate per-bucket pagination: each bucket's skip scales with its
  // own share of pageSize. Not perfectly stable across pages if the
  // underlying data changes between requests (no bucket-specific cursor),
  // but fine for a feed — same tradeoff most "mixed" feeds make.
  const skip = (page - 1) * pageSize;

  // "Primary" is always the OTHER side from the viewer's viewpoint — a
  // PROVIDER's primary match is NEED posts (prospective customers); a
  // SEEKER's primary match is OFFER posts (prospective providers).
  // "Secondary" is the SAME side as the viewer (peers).
  const primaryType = as === "PROVIDER" ? "NEED" : "OFFER";
  const secondaryType = as === "PROVIDER" ? "OFFER" : "NEED";

  const relatedCategoryIds = await getRelatedCategoryIds(categoryId);

  const [primaryPosts, secondaryPosts, relatedPosts] = await Promise.all([
    counts.primary > 0
      ? prisma.post.findMany({
          where: {
            categoryId,
            type: primaryType,
            status: "OPEN",
            authorId: { not: viewerAccountProfileId },
          },
          orderBy: { createdAt: "desc" },
          skip: Math.floor(skip * WEIGHTS.primary),
          take: counts.primary,
        })
      : Promise.resolve([]),
    counts.secondary > 0
      ? prisma.post.findMany({
          where: {
            categoryId,
            type: secondaryType,
            status: "OPEN",
            authorId: { not: viewerAccountProfileId },
          },
          orderBy: { createdAt: "desc" },
          skip: Math.floor(skip * WEIGHTS.secondary),
          take: counts.secondary,
        })
      : Promise.resolve([]),
    counts.related > 0 && relatedCategoryIds.length > 0
      ? prisma.post.findMany({
          where: {
            categoryId: { in: relatedCategoryIds },
            status: "OPEN",
            authorId: { not: viewerAccountProfileId },
          },
          orderBy: { createdAt: "desc" },
          skip: Math.floor(skip * WEIGHTS.related),
          take: counts.related,
        })
      : Promise.resolve([]),
  ]);

  const items = interleave([
    { items: primaryPosts, weight: WEIGHTS.primary, bucket: "primary" },
    { items: secondaryPosts, weight: WEIGHTS.secondary, bucket: "secondary" },
    { items: relatedPosts, weight: WEIGHTS.related, bucket: "related" },
  ]);

  return { items, composition: counts, page, pageSize };
}
