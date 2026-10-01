import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ApiError, handleApiError } from "@/lib/apiError";

interface Params {
  params: { slug: string };
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const post = await prisma.blogPost.findUnique({ where: { slug: params.slug } });
    if (!post || post.status !== "PUBLISHED") {
      throw new ApiError(404, "Blog post not found.");
    }
    return NextResponse.json({ post });
  } catch (err) {
    return handleApiError(err);
  }
}
