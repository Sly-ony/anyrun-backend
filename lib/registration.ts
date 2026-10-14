import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { registerSchema } from "@/lib/validation/auth";
import { deriveRoles } from "@/lib/roles";
import { signSession, setSessionCookie } from "@/lib/session";
import { ApiError } from "@/lib/apiError";
import { sanitizeUser } from "@/lib/user";

export async function registerAccount(
  request: NextRequest,
  accountKind: "INDIVIDUAL" | "BUSINESS"
) {
  const body = await request.json().catch(() => {
    throw new ApiError(400, "Request body must be valid JSON.");
  });

  const { email, phone, password, name, intent, address, serviceRegions } =
    registerSchema.parse(body);

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, ...(phone ? [{ phone }] : [])] },
  });
  if (existing) {
    throw new ApiError(409, "An account with this email or phone already exists.");
  }

  const passwordHash = await hashPassword(password);
  const roles = deriveRoles(accountKind, intent);

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
}