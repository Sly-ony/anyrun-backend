import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";

interface Params {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);

    const payoutMethod = await prisma.payoutMethod.findUnique({ where: { id } });
    if (!payoutMethod) throw new ApiError(404, "Payout method not found.");
    if (payoutMethod.accountProfileId !== auth.accountProfileId) {
      throw new ApiError(403, "You do not own this payout method.");
    }

    // Withdrawal.payoutMethodId is a required relation, so Postgres enforces
    // a real foreign key here (Mongo never did) — ANY withdrawal referencing
    // this payout method, including old completed/failed ones, would make
    // the delete below fail with a raw FK-constraint error instead of this
    // clean message. There's no soft-delete/history-preserving alternative
    // here yet; the payout method itself is just not removable once used.
    const anyWithdrawal = await prisma.withdrawal.findFirst({ where: { payoutMethodId: id } });
    if (anyWithdrawal) {
      throw new ApiError(
        409,
        "Cannot remove a payout method that has withdrawal history — this includes completed ones, kept for records."
      );
    }

    await prisma.payoutMethod.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
