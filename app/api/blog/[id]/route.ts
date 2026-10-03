import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const post = await prisma.blogPost.findUnique({ where: { id } });
    if (!post) throw new ApiError(404, "Blog post not found.");
    return NextResponse.json({ post });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "MANAGE_CONTENT");

    const post = await prisma.blogPost.findUnique({ where: { id } });
    if (!post) throw new ApiError(404, "Blog post not found.");

    await prisma.blogPost.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
