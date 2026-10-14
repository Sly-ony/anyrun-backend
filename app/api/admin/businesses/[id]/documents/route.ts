import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireSuperAdmin } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";
import { logAdminAction } from "@/lib/auditLog";
import { addBusinessDocumentsSchema } from "@/lib/validation/adminBusiness";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);
    requireSuperAdmin(auth);

    const profile = await prisma.accountProfile.findFirst({
      where: { id, accountKind: "BUSINESS", deletedAt: null },
    });
    if (!profile) throw new ApiError(404, "Business not found.");
    if (profile.source !== "ADMIN") {
      throw new ApiError(403, "Documents can only be added to businesses added by an admin.");
    }

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const { documents, notes } = addBusinessDocumentsSchema.parse(body);

    const verification = await prisma.verification.create({
      data: {
        accountProfileId: id,
        type: "BUSINESS",
        documents,
        notes,
        status: "APPROVED", // admin-supplied, so no review needed
        reviewedBy: auth.accountProfileId,
        reviewedAt: new Date(),
      },
    });

    await logAdminAction(auth.accountProfileId, "BUSINESS_DOCUMENTS_ADDED", "AccountProfile", id, {
      count: documents.length,
    });

    return NextResponse.json({ verification }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}