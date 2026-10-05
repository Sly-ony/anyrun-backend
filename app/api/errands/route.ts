import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { createErrandSchema } from "@/lib/validation/errand";
import { ERRAND_CUSTOMER_ROLES, RUNNER_ROLE } from "@/lib/roles";
import { anyRegionMatch } from "@/lib/region";
import { parsePagination } from "@/lib/pagination";
import { notifyNewErrandRequest } from "@/lib/notificationService";
import type { Prisma } from "@prisma/client";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    requireRole(auth, ERRAND_CUSTOMER_ROLES);

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
      console.error("Failed to notify runners of new errand:", e);
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
      requireRole(auth, [RUNNER_ROLE]);
      clauses.push({ runnerId: auth.accountProfileId });
    } else {
      // Default: the open browse feed, region-scoped for runners so they
      // only see requests relevant to where they actually operate.
      clauses.push({ status: "OPEN" });

      if (auth.roles.includes(RUNNER_ROLE)) {
        const profile = await prisma.accountProfile.findUnique({
          where: { id: auth.accountProfileId },
          select: { serviceRegions: true },
        });
        const regions = profile?.serviceRegions ?? [];
        if (regions.length > 0) {
          clauses.push(anyRegionMatch("location", regions));
        }
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
