import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { updateErrandSchema } from "@/lib/validation/errand";

interface Params {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    await requireAuth(request); // any authenticated account may view a single errand's detail
    const errand = await prisma.errandRequest.findUnique({ where: { id: params.id } });
    if (!errand) throw new ApiError(404, "Errand request not found.");
    return NextResponse.json({ errand });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(request);

    const errand = await prisma.errandRequest.findUnique({ where: { id: params.id } });
    if (!errand) throw new ApiError(404, "Errand request not found.");

    if (errand.customerId !== auth.accountProfileId) {
      throw new ApiError(403, "Only the customer who posted this errand can edit it.");
    }
    if (errand.status !== "OPEN") {
      throw new ApiError(409, "An errand can only be edited while it is still OPEN.");
    }

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const data = updateErrandSchema.parse(body);

    const updated = await prisma.errandRequest.update({
      where: { id: params.id },
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
  try {
    const auth = await requireAuth(request);

    const errand = await prisma.errandRequest.findUnique({ where: { id: params.id } });
    if (!errand) throw new ApiError(404, "Errand request not found.");

    if (errand.customerId !== auth.accountProfileId) {
      throw new ApiError(403, "Only the customer who posted this errand can cancel it.");
    }
    if (errand.status !== "OPEN") {
      throw new ApiError(
        409,
        "Only an OPEN errand can be cancelled this way — use the status endpoint once it has a runner."
      );
    }

    const updated = await prisma.errandRequest.update({
      where: { id: params.id },
      data: { status: "CANCELLED" },
    });

    return NextResponse.json({ errand: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
