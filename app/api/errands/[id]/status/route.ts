import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { errandStatusChangeSchema } from "@/lib/validation/errand";
import { checkErrandTransition } from "@/lib/errandStateMachine";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);

    const errand = await prisma.errandRequest.findUnique({ where: { id } });
    if (!errand) throw new ApiError(404, "Errand request not found.");

    const isCustomer = errand.customerId === auth.accountProfileId;
    const isRunner = errand.runnerId === auth.accountProfileId;
    if (!isCustomer && !isRunner) {
      throw new ApiError(403, "You are not a party to this errand.");
    }

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const { status: nextStatus } = errandStatusChangeSchema.parse(body);

    // If the caller is somehow both (shouldn't happen — a runner can't accept
    // their own errand) prefer whichever role the transition actually needs;
    // checkErrandTransition will reject if neither role fits.
    const actor: "customer" | "runner" = isCustomer ? "customer" : "runner";
    const error = checkErrandTransition(errand.status, nextStatus, actor);
    if (error) throw new ApiError(409, error);

    const updated = await prisma.errandRequest.update({
      where: { id },
      data: { status: nextStatus },
    });

    // Marking COMPLETED unlocks payment, but doesn't trigger it automatically
    // — the customer pays explicitly via POST /api/errands/[id]/pay.

    return NextResponse.json({ errand: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
