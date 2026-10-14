import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";
import { findCategoryRelation } from "@/lib/categoryRelations";
import { logAdminAction } from "@/lib/auditLog";

interface Params {
  params: Promise<{ id: string; relatedId: string }>;
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id, relatedId } = await params;
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "MANAGE_JOB_CATEGORIES");

    const relation = await findCategoryRelation(id, relatedId);
    if (!relation) throw new ApiError(404, "These categories are not related.");

    await prisma.relatedJobCategory.delete({ where: { id: relation.id } });

    await logAdminAction(auth.accountProfileId, "CATEGORY_RELATION_REMOVED", "RelatedJobCategory", relation.id, {
      categoryId: id,
      relatedCategoryId: relatedId,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
