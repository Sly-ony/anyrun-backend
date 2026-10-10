import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";
import { getRelatedCategories, findCategoryRelation } from "@/lib/categoryRelations";
import { logAdminAction } from "@/lib/auditLog";

interface Params {
  params: Promise<{ id: string }>;
}

const addRelationSchema = z.object({
  relatedCategoryId: z.string().min(1, "relatedCategoryId is required."),
});

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const category = await prisma.jobCategory.findUnique({ where: { id } });
    if (!category) throw new ApiError(404, "Job category not found.");

    const related = await getRelatedCategories(id);
    return NextResponse.json({ related });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "MANAGE_JOB_CATEGORIES");

    const category = await prisma.jobCategory.findUnique({ where: { id } });
    if (!category) throw new ApiError(404, "Job category not found.");

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const { relatedCategoryId } = addRelationSchema.parse(body);

    if (relatedCategoryId === id) {
      throw new ApiError(400, "A category cannot be related to itself.");
    }
    const relatedCategory = await prisma.jobCategory.findUnique({ where: { id: relatedCategoryId } });
    if (!relatedCategory) throw new ApiError(404, "relatedCategoryId does not exist.");

    const existing = await findCategoryRelation(id, relatedCategoryId);
    if (existing) throw new ApiError(409, "These categories are already related.");

    const relation = await prisma.relatedJobCategory.create({
      data: { categoryAId: id, categoryBId: relatedCategoryId },
    });

    await logAdminAction(auth.accountProfileId, "CATEGORY_RELATION_ADDED", "RelatedJobCategory", relation.id, {
      categoryA: category.name,
      categoryB: relatedCategory.name,
    });

    return NextResponse.json({ relation }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
