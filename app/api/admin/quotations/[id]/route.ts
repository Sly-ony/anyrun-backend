import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "VIEW_PLATFORM_DATA");

    const quotation = await prisma.quotation.findUnique({ where: { id } });
    if (!quotation) throw new ApiError(404, "Quotation not found.");

    return NextResponse.json({ quotation });
  } catch (err) {
    return handleApiError(err);
  }
}
