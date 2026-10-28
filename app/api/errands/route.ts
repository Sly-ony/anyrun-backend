import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { createErrandSchema } from "@/lib/validation/errand";
import { anyRegionMatch } from "@/lib/region";
import { asLocationArray } from "@/lib/json";
import { parsePagination } from "@/lib/pagination";
import { notifyNewErrandRequest } from "@/lib/notificationService";
import type { Prisma } from "@prisma/client";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const data = createErrandSchema.parse(body);

    const errand = await prisma.errandRequest.create({
      data: {
        customerId: auth.accountProfileId,
        description: data.description,
        category: data.category,
        location: data.location,
        budget: data.budget,
        photos: data.photos ?? [],
        deadline: data.deadline,
        status: "OPEN",
      },
    });

    try {
      await notifyNewErrandRequest(errand);
    } catch (e) {
      console.error("Failed to notify providers of new job:", e);
    }

    return NextResponse.json({ errand }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const { skip, take, page, pageSize } = parsePagination(searchParams);

    const mine = searchParams.get("mine") === "true";
    const assignedToMe = searchParams.get("assignedToMe") === "true";
    const category = searchParams.get("category") ?? undefined;
    const statusParam = searchParams.get("status") ?? undefined;

    const clauses: Prisma.ErrandRequestWhereInput[] = [];

    if (mine) {
      clauses.push({ customerId: auth.accountProfileId });
    } else if (assignedToMe) {
      clauses.push({ runnerId: auth.accountProfileId });
    } else {
      // Default: the open browse list. If the user has saved service regions,
      // only jobs in those regions are shown.
      clauses.push({ status: "OPEN" });

      const profile = await prisma.accountProfile.findUnique({
        where: { id: auth.accountProfileId },
        select: { serviceRegions: true },
      });
      const regions = asLocationArray(profile?.serviceRegions);
      if (regions.length > 0) {
        clauses.push(anyRegionMatch("location", regions));
      }
    }

    if (category) {
      clauses.push({ category });
    }
    if (statusParam) {
      clauses.push({ status: statusParam as Prisma.EnumErrandStatusFilter["equals"] });
    }

    const where: Prisma.ErrandRequestWhereInput = { AND: clauses };

    const [items, total] = await Promise.all([
      prisma.errandRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.errandRequest.count({ where }),
    ]);

    return NextResponse.json({ items, page, pageSize, total });
  } catch (err) {
    return handleApiError(err);
  }
}