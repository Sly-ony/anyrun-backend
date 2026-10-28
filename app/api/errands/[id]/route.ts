import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { updateErrandSchema } from "@/lib/validation/errand";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request); // any authenticated account may view a single errand's detail
    const errand = await prisma.errandRequest.findUnique({ where: { id } });
    if (!errand) throw new ApiError(404, "Errand request not found.");

    const isParty =
      errand.customerId === auth.accountProfileId || errand.runnerId === auth.accountProfileId;

    // Only the two people on the job learn about disputes and payment.
    let dispute = null;
    let escrowStatus: string | null = null;
    if (isParty) {
      const [d, order] = await Promise.all([
        prisma.dispute.findFirst({
          where: { relatedType: "ERRAND", relatedId: id, status: { in: ["OPEN", "IN_REVIEW"] } },
          select: { id: true, status: true },
        }),
        prisma.orderTx.findUnique({
          where: { sourceErrandId: id },
          select: { escrowStatus: true },
        }),
      ]);
      dispute = d;
      escrowStatus = order?.escrowStatus ?? "NONE";
    }

    return NextResponse.json({ errand, dispute, escrowStatus });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);

    const errand = await prisma.errandRequest.findUnique({ where: { id } });
    if (!errand) throw new ApiError(404, "Errand request not found.");

    if (errand.customerId !== auth.accountProfileId) {
      throw new ApiError(403, "Only the customer who posted this job can edit it.");
    }
    if (errand.status !== "OPEN") {
      throw new ApiError(409, "A job can only be edited while it is still OPEN.");
    }

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const data = updateErrandSchema.parse(body);

    const updated = await prisma.errandRequest.update({
      where: { id },
      data,
    });

    return NextResponse.json({ errand: updated });
  } catch (err) {
    return handleApiError(err);
  }
}

// Soft-cancel rather than a hard delete, so completed/in-flight history and
// any linked Order/DeliveryJob remain intact and auditable.
export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);

    const errand = await prisma.errandRequest.findUnique({ where: { id } });
    if (!errand) throw new ApiError(404, "Errand request not found.");

    if (errand.customerId !== auth.accountProfileId) {
      throw new ApiError(403, "Only the customer who posted this job can cancel it.");
    }
    if (errand.status !== "OPEN") {
      throw new ApiError(
        409,
        "Only an OPEN job can be cancelled this way. Use the status endpoint once it has a provider."
      );
    }

    const updated = await prisma.errandRequest.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    return NextResponse.json({ errand: updated });
  } catch (err) {
    return handleApiError(err);
  }
}