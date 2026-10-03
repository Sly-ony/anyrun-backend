import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";

interface Params {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "MANAGE_CONTENT");

    const advert = await prisma.advertPost.findUnique({ where: { id } });
    if (!advert) throw new ApiError(404, "Advert post not found.");

    await prisma.advertPost.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
