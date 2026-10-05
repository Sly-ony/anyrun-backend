import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import prisma from "@/lib/prisma";
import { ApiError, handleApiError } from "@/lib/apiError";
import { confirmPasswordResetSchema } from "@/lib/validation/passwordReset";
import { hashPassword } from "@/lib/password";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const { token, newPassword } = confirmPasswordResetSchema.parse(body);

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new ApiError(400, "This password reset link is invalid or has expired.");
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.$transaction([
      prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
      // Invalidate any other outstanding reset requests for this user —
      // a successful reset should close out every pending link, not just
      // the one that was used.
      prisma.passwordResetToken.updateMany({
        where: { userId: resetToken.userId, usedAt: null, id: { not: resetToken.id } },
        data: { usedAt: new Date() },
      }),
    ]);

    return NextResponse.json({ message: "Password updated. You can now log in with your new password." });
  } catch (err) {
    return handleApiError(err);
  }
}
