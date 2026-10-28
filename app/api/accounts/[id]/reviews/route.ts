import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ApiError, handleApiError } from "@/lib/apiError";
import { parsePagination } from "@/lib/pagination";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const profile = await prisma.accountProfile.findUnique({
      where: { id },
      select: { isActive: true },
    });
    if (!profile || !profile.isActive) throw new ApiError(404, "Account not found.");

    const { searchParams } = new URL(request.url);
    const { skip, take, page, pageSize } = parsePagination(searchParams);

    const [rows, agg] = await Promise.all([
      prisma.review.findMany({
        where: { targetId: id },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.review.aggregate({
        where: { targetId: id },
        _avg: { rating: true },
        _count: { _all: true },
      }),
    ]);

    const authors = await prisma.accountProfile.findMany({
      where: { id: { in: rows.map((r) => r.authorId) } },
      select: { id: true, user: { select: { name: true, avatarUrl: true } } },
    });
    const byId = new Map(authors.map((a) => [a.id, a]));

    const items = rows.map((r) => {
      const a = byId.get(r.authorId);
      return {
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        author: a ? { id: a.id, name: a.user.name, avatarUrl: a.user.avatarUrl } : null,
      };
    });

    return NextResponse.json({
      items,
      page,
      pageSize,
      total: agg._count._all,
      summary: {
        ratingAverage: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : null,
        ratingCount: agg._count._all,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}