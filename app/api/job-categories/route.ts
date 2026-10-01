import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";
import { createJobCategorySchema } from "@/lib/validation/jobCategory";

// Public: this is the list an individual sees when choosing "get a job" at
// onboarding, so it has to be readable before login.
export async function GET() {
  try {
    const categories = await prisma.jobCategory.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ categories });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "MANAGE_JOB_CATEGORIES");

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const data = createJobCategorySchema.parse(body);

    const existing = await prisma.jobCategory.findUnique({ where: { name: data.name } });
    if (existing) throw new ApiError(409, "A job category with this name already exists.");

    const category = await prisma.jobCategory.create({ data });
    return NextResponse.json({ category }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
