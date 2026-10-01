import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, getOptionalAuth } from "@/lib/guard";
import { requireAdminCapability, hasCapability } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";
import { createBlogPostSchema } from "@/lib/validation/blogPost";
import { parsePagination } from "@/lib/pagination";
import type { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { skip, take, page, pageSize } = parsePagination(searchParams);
    const statusParam = searchParams.get("status");

    let where: Prisma.BlogPostWhereInput = { status: "PUBLISHED" };

    if (statusParam === "DRAFT") {
      const auth = await getOptionalAuth(request);
      if (!auth || !hasCapability(auth.adminRole, "MANAGE_CONTENT")) {
        throw new ApiError(403, "Only content admins can view draft posts.");
      }
      where = { status: "DRAFT" };
    }

    const [items, total] = await Promise.all([
      prisma.blogPost.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.blogPost.count({ where }),
    ]);

    return NextResponse.json({ items, page, pageSize, total });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "MANAGE_CONTENT");

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const data = createBlogPostSchema.parse(body);

    const existing = await prisma.blogPost.findUnique({ where: { slug: data.slug } });
    if (existing) throw new ApiError(409, "A blog post with this slug already exists.");

    const post = await prisma.blogPost.create({
      data: {
        ...data,
        authorId: auth.accountProfileId,
        publishedAt: data.status === "PUBLISHED" ? new Date() : null,
      },
    });

    return NextResponse.json({ post }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
