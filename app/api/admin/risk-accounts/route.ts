import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { handleApiError } from "@/lib/apiError";
import { parsePagination } from "@/lib/pagination";
import { getRiskStats } from "@/lib/risk";

// Accounts with several disputes against them or a high cancellation rate.
// Suspend an account with the existing admin suspension endpoint.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "MANAGE_USERS");

    const { searchParams } = new URL(request.url);
    const { skip, take, page, pageSize } = parsePagination(searchParams);
    const levelFilter = searchParams.get("level"); // HIGH | MEDIUM | omitted (both)

    const [disputeGroups, cancelGroups] = await Promise.all([
      prisma.dispute.groupBy({
        by: ["againstId"],
        where: { againstId: { not: null } },
        _count: { _all: true },
      }),
      prisma.errandEvent.groupBy({
        by: ["actorId"],
        where: { toStatus: "CANCELLED", actorId: { not: null } },
        _count: { _all: true },
      }),
    ]);

    const candidateIds = new Set<string>();
    for (const g of disputeGroups) if (g.againstId && g._count._all >= 2) candidateIds.add(g.againstId);
    for (const g of cancelGroups) if (g.actorId && g._count._all >= 2) candidateIds.add(g.actorId);

    const ids = Array.from(candidateIds).slice(0, 300);
    const profiles = await prisma.accountProfile.findMany({
      where: { id: { in: ids } },
      include: { user: { select: { name: true, email: true } } },
    });

    const rows = await Promise.all(
      profiles.map(async (p) => ({
        profileId: p.id,
        name: p.user.name,
        email: p.user.email,
        accountKind: p.accountKind,
        isActive: p.isActive,
        risk: await getRiskStats(p.id),
      }))
    );

    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
    const flagged = rows
      .filter((r) => r.risk.level !== "LOW" && (!levelFilter || r.risk.level === levelFilter))
      .sort((a, b) => order[a.risk.level] - order[b.risk.level]);

    return NextResponse.json({
      items: flagged.slice(skip, skip + take),
      page,
      pageSize,
      total: flagged.length,
    });
  } catch (err) {
    return handleApiError(err);
  }
}