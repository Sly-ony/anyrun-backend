import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { loginSchema } from "@/lib/validation/auth";
import { signSession, setSessionCookie } from "@/lib/session";
import { ApiError, handleApiError } from "@/lib/apiError";
import { sanitizeUser } from "@/lib/user";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });

    const { email, password } = loginSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { email },
      include: { accountProfile: true },
    });

    // Same error for "no such user" and "wrong password" so we don't leak
    // which emails are registered. Also covers OAuth-only accounts, which
    // have no passwordHash to compare against.
    if (!user || !user.passwordHash) {
      throw new ApiError(401, "Invalid email or password.");
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw new ApiError(401, "Invalid email or password.");
    }

    if (!user.accountProfile) {
      // Shouldn't happen given signup always creates both together, but
      // fail clearly rather than issuing a session with no profile to match.
      throw new ApiError(500, "Account profile is missing. Contact support.");
    }

    if (!user.accountProfile.isActive) {
      throw new ApiError(403, "This account has been deactivated.");
    }

    const token = signSession({
      sub: user.id,
      accountProfileId: user.accountProfile.id,
      roles: user.accountProfile.roles,
    });

    const response = NextResponse.json({
      user: sanitizeUser(user),
      profile: user.accountProfile,
      token,
    });
    setSessionCookie(response, token);
    return response;
  } catch (err) {
    return handleApiError(err);
  }
}
