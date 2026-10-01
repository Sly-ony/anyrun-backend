import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";
import { createAdvertPostSchema } from "@/lib/validation/advertPost";
import type { Prisma } from "@prisma/client";

export async function GET() {
  try {
    const now = new Date();
    const where: Prisma.AdvertPostWhereInput = {
      isActive: true,
      AND: [
        { OR: [{ startDate: null }, { startDate: { lte: now } }] },
        { OR: [{ endDate: null }, { endDate: { gte: now } }] },
      ],
    };

    const adverts = await prisma.advertPost.findMany({ where, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ adverts });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "MANAGE_CONTENT");

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const data = createAdvertPostSchema.parse(body);

    const advert = await prisma.advertPost.create({
      data: { ...data, authorId: auth.accountProfileId },
    });

    return NextResponse.json({ advert }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
