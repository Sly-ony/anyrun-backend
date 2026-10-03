import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { createDepositSchema } from "@/lib/validation/wallet";
import { getGatewayAdapter } from "@/lib/payments";
import { parsePagination } from "@/lib/pagination";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const { amount, provider, currency } = createDepositSchema.parse(body);

    const user = await prisma.user.findUnique({ where: { id: auth.userId } });
    if (!user) throw new ApiError(404, "User not found.");

    const reference = `dep_${randomUUID()}`;
    const callbackUrl = process.env.WALLET_DEPOSIT_CALLBACK_URL;
    if (!callbackUrl) {
      throw new ApiError(500, "WALLET_DEPOSIT_CALLBACK_URL is not configured on the server.");
    }

    const deposit = await prisma.deposit.create({
      data: {
        accountProfileId: auth.accountProfileId,
        provider,
        amount,
        currency,
        status: "PENDING",
        reference,
      },
    });

    const adapter = getGatewayAdapter(provider);
    let checkoutUrl: string;
    try {
      const result = await adapter.initializePayment({
        email: user.email,
        amount,
        currency,
        reference,
        callbackUrl,
      });
      checkoutUrl = result.checkoutUrl;
    } catch (err) {
      await prisma.deposit.update({ where: { id: deposit.id }, data: { status: "FAILED" } });
      throw new ApiError(
        502,
        `Could not start the deposit with ${provider}: ${err instanceof Error ? err.message : "unknown error"}`
      );
    }

    const updated = await prisma.deposit.update({
      where: { id: deposit.id },
      data: { checkoutUrl },
    });

    return NextResponse.json({ deposit: updated }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const { skip, take, page, pageSize } = parsePagination(searchParams);

    const where = { accountProfileId: auth.accountProfileId };

    const [items, total] = await Promise.all([
      prisma.deposit.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.deposit.count({ where }),
    ]);

    return NextResponse.json({ items, page, pageSize, total });
  } catch (err) {
    return handleApiError(err);
  }
}
