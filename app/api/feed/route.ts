import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { getWeightedFeed, getPersonalizedFeed, type FeedViewpoint } from "@/lib/feed";
import { parsePagination } from "@/lib/pagination";
import { shapePost } from "@/lib/postShape";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const { page, pageSize } = parsePagination(searchParams);

    const categoryId = searchParams.get("categoryId");

    // Optional single-category feed (e.g. when the user taps a category chip).
    if (categoryId) {
      const category = await prisma.jobCategory.findUnique({ where: { id: categoryId } });
      if (!category) throw new ApiError(404, "Job category not found.");

      let as = searchParams.get("as") as FeedViewpoint | null;
      if (as !== "PROVIDER" && as !== "SEEKER") {
        const profile = await prisma.accountProfile.findUnique({
          where: { id: auth.accountProfileId },
          select: { jobCategoryIds: true },
        });
        as = profile?.jobCategoryIds.includes(categoryId) ? "PROVIDER" : "SEEKER";
      }

      const feed = await getWeightedFeed({
        categoryId,
        as,
        viewerAccountProfileId: auth.accountProfileId,
        page,
        pageSize,
      });

      return NextResponse.json({
        ...feed,
        items: feed.items.map((i) => ({ ...shapePost(i), feedBucket: i.feedBucket })),
        mode: "CATEGORY",
        as,
        category: { id: category.id, name: category.name },
      });
    }

    // Default: personalised by the jobs the user selected.
    const typeParam = searchParams.get("type");
    if (typeParam && typeParam !== "NEED" && typeParam !== "OFFER") {
      throw new ApiError(400, "type must be NEED or OFFER.");
    }

    const profile = await prisma.accountProfile.findUnique({
      where: { id: auth.accountProfileId },
      select: { jobCategoryIds: true },
    });
    const selectedCategoryIds = profile?.jobCategoryIds ?? [];

    const [feed, selectedCategories] = await Promise.all([
      getPersonalizedFeed({
        selectedCategoryIds,
        viewerAccountProfileId: auth.accountProfileId,
        type: (typeParam as "NEED" | "OFFER" | null) ?? undefined,
        page,
        pageSize,
      }),
      selectedCategoryIds.length
        ? prisma.jobCategory.findMany({
            where: { id: { in: selectedCategoryIds } },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          })
        : Promise.resolve([]),
    ]);

    return NextResponse.json({
      ...feed,
      items: feed.items.map((i) => ({ ...shapePost(i), feedBucket: i.feedBucket })),
      mode: "PERSONALIZED",
      selectedCategories,
    });
  } catch (err) {
    return handleApiError(err);
  }
}