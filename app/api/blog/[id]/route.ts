import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";

interface Params {
  params: { id: string };
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const post = await prisma.blogPost.findUnique({ where: { id: params.id } });
    if (!post) throw new ApiError(404, "Blog post not found.");
    return NextResponse.json({ post });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "MANAGE_CONTENT");

    const post = await prisma.blogPost.findUnique({ where: { id: params.id } });
    if (!post) throw new ApiError(404, "Blog post not found.");

    await prisma.blogPost.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
