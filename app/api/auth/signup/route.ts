import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { signupSchema } from "@/lib/validation/auth";
import { deriveRoles } from "@/lib/roles";
import { signSession, setSessionCookie } from "@/lib/session";
import { ApiError, handleApiError } from "@/lib/apiError";
import { sanitizeUser } from "@/lib/user";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });

    const {
      email,
      phone,
      password,
      name,
      accountKind,
      intent,
      address,
      businessName,
      businessAddress,
      businessDocuments,
      serviceRegions,
    } = signupSchema.parse(body);

    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email }, ...(phone ? [{ phone }] : [])],
      },
    });
    if (existing) {
      throw new ApiError(409, "An account with this email or phone already exists.");
    }

    const passwordHash = await hashPassword(password);
    const roles = deriveRoles(accountKind, intent);

    // User + AccountProfile (+ the BUSINESS verification submission, if
    // applicable) are all created together so we never end up with an
    // orphaned auth identity, a profile with no user, or a BUSINESS account
    // whose documents were accepted but never actually recorded for review.
    const { user, profile } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, phone, passwordHash, name },
      });

      const profile = await tx.accountProfile.create({
        data: {
          userId: user.id,
          roles,
          accountKind,
          address,
          businessName: businessName ?? null,
          businessAddress: businessAddress ?? undefined,
          serviceRegions: serviceRegions ?? [],
        },
      });

      // The business documents collected at registration go straight into
      // a PENDING verification — no separate submission step needed
      // afterward. See POST /api/account/business-verification for the
      // resubmit-after-rejection path.
      if (accountKind === "BUSINESS" && businessDocuments) {
        await tx.verification.create({
          data: {
            accountProfileId: profile.id,
            type: "BUSINESS",
            documents: businessDocuments,
            status: "PENDING",
          },
        });
      }

      return { user, profile };
    });

    const token = signSession({
      sub: user.id,
      accountProfileId: profile.id,
      roles: profile.roles,
    });

    const response = NextResponse.json(
      { user: sanitizeUser(user), profile, token },
      { status: 201 }
    );
    setSessionCookie(response, token);
    return response;
  } catch (err) {
    return handleApiError(err);
  }
}
