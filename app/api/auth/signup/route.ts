import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { signupSchema } from "@/lib/validation/auth";
import { deriveAccountKind } from "@/lib/roles";
import { signSession, setSessionCookie } from "@/lib/session";
import { ApiError, handleApiError } from "@/lib/apiError";
import { sanitizeUser } from "@/lib/user";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });

    const { email, phone, password, name, roles, businessName, serviceRegions } =
      signupSchema.parse(body);

    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email }, ...(phone ? [{ phone }] : [])],
      },
    });
    if (existing) {
      throw new ApiError(409, "An account with this email or phone already exists.");
    }

    const passwordHash = await hashPassword(password);

    // User + AccountProfile are created together so we never end up with an
    // orphaned auth identity that has no profile (or vice versa).
    const { user, profile } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, phone, passwordHash, name },
      });

      const profile = await tx.accountProfile.create({
        data: {
          userId: user.id,
          roles,
          accountKind: deriveAccountKind(roles),
          businessName: businessName ?? null,
          serviceRegions: serviceRegions ?? [],
        },
      });

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
