import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { updatePostSchema } from "@/lib/validation/post";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    await requireAuth(request);
    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) throw new ApiError(404, "Post not found.");
    return NextResponse.json({ post });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);

    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) throw new ApiError(404, "Post not found.");
    if (post.authorId !== auth.accountProfileId) {
      throw new ApiError(403, "Only the author can edit this post.");
    }

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const data = updatePostSchema.parse(body);

    const updated = await prisma.post.update({ where: { id }, data });
    return NextResponse.json({ post: updated });
  } catch (err) {
    return handleApiError(err);
  }
}

// Soft-close rather than delete — a CLOSED post stays visible in the
// author's own history, just excluded from the default feed/browse.
export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);

    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) throw new ApiError(404, "Post not found.");
    if (post.authorId !== auth.accountProfileId) {
      throw new ApiError(403, "Only the author can close this post.");
    }

    const updated = await prisma.post.update({ where: { id }, data: { status: "CLOSED" } });
    return NextResponse.json({ post: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
