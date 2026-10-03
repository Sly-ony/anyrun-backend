import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";
import { updateJobCategorySchema } from "@/lib/validation/jobCategory";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const category = await prisma.jobCategory.findUnique({ where: { id } });
    if (!category) throw new ApiError(404, "Job category not found.");
    return NextResponse.json({ category });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "MANAGE_JOB_CATEGORIES");

    const category = await prisma.jobCategory.findUnique({ where: { id } });
    if (!category) throw new ApiError(404, "Job category not found.");

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const data = updateJobCategorySchema.parse(body);

    if (data.name && data.name !== category.name) {
      const clash = await prisma.jobCategory.findUnique({ where: { name: data.name } });
      if (clash) throw new ApiError(409, "A job category with this name already exists.");
    }

    const updated = await prisma.jobCategory.update({ where: { id }, data });
    return NextResponse.json({ category: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
