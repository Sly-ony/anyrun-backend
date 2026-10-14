import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { createPostSchema } from "@/lib/validation/post";
import { RUNNER_ROLE } from "@/lib/roles";
import { hasApprovedCategoryVerification } from "@/lib/verificationRules";
import { parsePagination } from "@/lib/pagination";
import type { Prisma } from "@prisma/client";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const data = createPostSchema.parse(body);

    const category = await prisma.jobCategory.findUnique({ where: { id: data.categoryId } });
    if (!category || !category.isActive) {
      throw new ApiError(400, "Invalid or inactive categoryId.");
    }

    // An OFFER post is "I provide this service" — only makes sense for an
    // account that actually selected this category as something they
    // provide (see POST /api/account/job-categories). A NEED post has no
    // such restriction: anyone can need a service without being registered
    // as anything in particular.
    if (data.type === "OFFER") {
      if (!auth.roles.includes(RUNNER_ROLE)) {
        throw new ApiError(403, "Only accounts that provide services can post an OFFER.");
      }
      const profile = await prisma.accountProfile.findUnique({ where: { id: auth.accountProfileId } });
      if (!profile?.jobCategoryIds.includes(data.categoryId)) {
        throw new ApiError(
          403,
          "You can only post an OFFER for a category you've selected via POST /api/account/job-categories."
        );
      }
      // Same gate as accepting an errand in this category: a verification-
      // required category stays off-limits until the verification is
      // APPROVED, without blocking any *other* category the account has
      // selected.
      if (category.requiresVerification) {
        const verified = await hasApprovedCategoryVerification(auth.accountProfileId, category.id);
        if (!verified) {
          throw new ApiError(
            403,
            `The "${category.name}" category requires verification before you can post an OFFER in it.`
          );
        }
      }
    }

    const post = await prisma.post.create({
      data: {
        type: data.type,
        authorId: auth.accountProfileId,
        categoryId: data.categoryId,
        title: data.title,
        description: data.description,
        tags: data.tags ?? [],
        location: data.location,
        status: "OPEN",
      },
    });

    return NextResponse.json({ post }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const { skip, take, page, pageSize } = parsePagination(searchParams);

    const mine = searchParams.get("mine") === "true";
    const type = searchParams.get("type") ?? undefined;
    const categoryId = searchParams.get("categoryId") ?? undefined;
    const status = searchParams.get("status") ?? (mine ? undefined : "OPEN");

    const clauses: Prisma.PostWhereInput[] = [];
    if (mine) clauses.push({ authorId: auth.accountProfileId });
    if (type) clauses.push({ type: type as Prisma.EnumPostTypeFilter["equals"] });
    if (categoryId) clauses.push({ categoryId });
    if (status) clauses.push({ status: status as Prisma.EnumPostStatusFilter["equals"] });

    const where: Prisma.PostWhereInput = clauses.length ? { AND: clauses } : {};

    const [items, total] = await Promise.all([
      prisma.post.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.post.count({ where }),
    ]);

    return NextResponse.json({ items, page, pageSize, total });
  } catch (err) {
    return handleApiError(err);
  }
}
