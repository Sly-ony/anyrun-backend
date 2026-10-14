import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";

interface Params {
  params: Promise<{ id: string }>;
}

// GET /api/rfqs/{id} (user-facing) only shows every quotation to the RFQ's
// own buyer — a supplier sees just their own, anyone else gets none. This
// is the admin bypass: every quotation, regardless of who's asking.
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "VIEW_PLATFORM_DATA");

    const rfq = await prisma.rFQ.findUnique({ where: { id } });
    if (!rfq) throw new ApiError(404, "RFQ not found.");

    const quotations = await prisma.quotation.findMany({
      where: { rfqId: id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ rfq, quotations });
  } catch (err) {
    return handleApiError(err);
  }
}
