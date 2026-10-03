import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { getGatewayAdapter } from "@/lib/payments";
import { completeDeposit } from "@/lib/depositService";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);

    let deposit = await prisma.deposit.findUnique({ where: { id } });
    if (!deposit) throw new ApiError(404, "Deposit not found.");
    if (deposit.accountProfileId !== auth.accountProfileId) {
      throw new ApiError(403, "You do not have permission to view this deposit.");
    }

    // The webhook is the primary completion path, but it can be delayed —
    // this gives the frontend an immediate answer when the user lands back
    // on a "confirming your payment..." screen after checkout.
    if (deposit.status === "PENDING") {
      try {
        const adapter = getGatewayAdapter(deposit.provider);
        const verification = await adapter.verifyPayment(deposit.reference);
        const updated = await completeDeposit(
          deposit.id,
          verification.success
            ? { success: true, amount: verification.amount, providerReference: verification.providerReference }
            : { success: false }
        );
        if (updated) deposit = updated;
      } catch (e) {
        // Verification call itself failing (network, gateway down) just
        // means we report the still-PENDING state below — not a hard error.
        console.error("Deposit verification check failed:", e);
      }
    }

    return NextResponse.json({ deposit });
  } catch (err) {
    return handleApiError(err);
  }
}
