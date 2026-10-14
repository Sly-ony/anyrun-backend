import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ApiError, handleApiError } from "@/lib/apiError";
import { asLocationArray, asAddress } from "@/lib/json";

interface Params {
  params: Promise<{ id: string }>;
}

// Public: no auth required to look up a business's display info. Deliberately
// strips anything precise (postalCode, coordinates) from serviceRegions —
// city/state level is enough for "does this supplier cover my area?", and we
// don't want to publish exact addresses for accounts that haven't opted into
// that via a catalog listing or an active request.
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const profile = await prisma.accountProfile.findUnique({ where: { id } });
    if (!profile || !profile.isActive) {
      throw new ApiError(404, "Account not found.");
    }

    const user = await prisma.user.findUnique({ where: { id: profile.userId } });
    if (!user) throw new ApiError(404, "Account not found.");

    return NextResponse.json({
      account: {
        id: profile.id,
        name: user.name,
        avatarUrl: user.avatarUrl,
        roles: profile.roles,
        businessName: profile.businessName,
        // City/state only, never the full street address — same privacy
        // reasoning as serviceRegions below. Only present for BUSINESS
        // accounts; an individual's home address is never public at all.
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
        createdAt: profile.createdAt,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
