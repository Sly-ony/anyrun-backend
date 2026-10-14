import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { createPayoutMethodSchema } from "@/lib/validation/payoutMethod";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const data = createPayoutMethodSchema.parse(body);

    if (data.isDefault) {
      await prisma.payoutMethod.updateMany({
        where: { accountProfileId: auth.accountProfileId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const payoutMethod = await prisma.payoutMethod.create({
      data: {
        accountProfileId: auth.accountProfileId,
        accountName: data.accountName,
        accountNumber: data.accountNumber,
        bankCode: data.bankCode,
        bankName: data.bankName,
        currency: data.currency,
        isDefault: data.isDefault,
      },
    });

    return NextResponse.json({ payoutMethod }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);

    const payoutMethods = await prisma.payoutMethod.findMany({
      where: { accountProfileId: auth.accountProfileId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ payoutMethods });
  } catch (err) {
    return handleApiError(err);
  }
}
