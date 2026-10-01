import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { handleApiError } from "@/lib/apiError";
import { parsePagination } from "@/lib/pagination";
import type { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "MANAGE_VERIFICATIONS");

    const { searchParams } = new URL(request.url);
    const { skip, take, page, pageSize } = parsePagination(searchParams);
    const status = searchParams.get("status") ?? "PENDING"; // pass status=ALL for everything
    const type = searchParams.get("type") ?? undefined; // BUSINESS | JOB_CATEGORY

    const where: Prisma.VerificationWhereInput = {
      ...(status !== "ALL" ? { status: status as Prisma.EnumVerificationStatusFilter["equals"] } : {}),
      ...(type ? { type: type as Prisma.EnumVerificationTypeFilter["equals"] } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.verification.findMany({ where, orderBy: { submittedAt: "asc" }, skip, take }),
      prisma.verification.count({ where }),
    ]);

    return NextResponse.json({ items, page, pageSize, total });
  } catch (err) {
    return handleApiError(err);
  }
}
