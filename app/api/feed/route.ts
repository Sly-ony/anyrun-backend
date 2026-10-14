import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { getWeightedFeed, type FeedViewpoint } from "@/lib/feed";
import { parsePagination } from "@/lib/pagination";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const { page, pageSize } = parsePagination(searchParams);

    const categoryId = searchParams.get("categoryId");
    if (!categoryId) throw new ApiError(400, "categoryId query param is required.");

    const category = await prisma.jobCategory.findUnique({ where: { id: categoryId } });
    if (!category) throw new ApiError(404, "Job category not found.");

    let as = searchParams.get("as") as FeedViewpoint | null;
    if (as !== "PROVIDER" && as !== "SEEKER") {
      // Infer from the viewer's own selected categories if not specified —
      // "am I offering this, or looking for it".
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

    return NextResponse.json({ ...feed, as, category: { id: category.id, name: category.name } });
  } catch (err) {
    return handleApiError(err);
  }
}
