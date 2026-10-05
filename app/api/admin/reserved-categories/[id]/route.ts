import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";
import { logAdminAction } from "@/lib/auditLog";

interface Params {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "MANAGE_JOB_CATEGORIES");

    const existing = await prisma.reservedCategoryKeyword.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Reserved keyword not found.");

    await prisma.reservedCategoryKeyword.delete({ where: { id } });

    await logAdminAction(auth.accountProfileId, "RESERVED_CATEGORY_REMOVED", "ReservedCategoryKeyword", id, {
      keyword: existing.keyword,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
