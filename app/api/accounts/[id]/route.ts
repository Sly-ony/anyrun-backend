import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ApiError, handleApiError } from "@/lib/apiError";
import { asLocationArray, asAddress } from "@/lib/json";

interface Params {
  params: Promise<{ id: string }>;
}

// Public: no auth required. Never returns email, phone, street address, VAT or
// documents. City/state level only.
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const profile = await prisma.accountProfile.findUnique({ where: { id } });
    // deletedAt check added: deleted businesses must not have a public page.
    if (!profile || !profile.isActive || profile.deletedAt) {
      throw new ApiError(404, "Account not found.");
    }

    const user = await prisma.user.findUnique({ where: { id: profile.userId } });
    if (!user) throw new ApiError(404, "Account not found.");

    const [jobsCompleted, ratings] = await Promise.all([
      prisma.errandRequest.count({
        where: { status: "COMPLETED", OR: [{ customerId: id }, { runnerId: id }] },
      }),
      prisma.review.aggregate({
        where: { targetId: id },
        _avg: { rating: true },
        _count: { _all: true },
      }),
    ]);

    return NextResponse.json({
      account: {
        id: profile.id,
        name: user.name,
        avatarUrl: user.avatarUrl,
        bio: profile.bio,
        roles: profile.roles,
        businessName: profile.businessName,
        source: profile.source,
        businessLocation:
          profile.accountKind === "BUSINESS" && profile.businessAddress
            ? (() => {
                const a = asAddress(profile.businessAddress);
                return { country: a.country, state: a.state, city: a.city };
              })()
            : null,
        serviceRegions: asLocationArray(profile.serviceRegions).map((r) => ({
          country: r.country,
          state: r.state,
          city: r.city,
        })),
        stats: {
          jobsCompleted,
          ratingAverage: ratings._avg.rating ? Math.round(ratings._avg.rating * 10) / 10 : null,
          ratingCount: ratings._count._all,
        },
        createdAt: profile.createdAt,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}