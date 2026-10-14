import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { hashPassword } from "@/lib/password";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: z.string().min(8, "New password must be at least 8 characters."),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const { currentPassword, newPassword } = changePasswordSchema.parse(body);

    const user = await prisma.user.findUnique({ where: { id: auth.userId } });
    if (!user?.passwordHash) {
      throw new ApiError(400, "This account has no password set.");
    }
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new ApiError(400, "Current password is incorrect.");
    }
    if (currentPassword === newPassword) {
      throw new ApiError(400, "New password must be different from the current one.");
    }

    await prisma.user.update({
      where: { id: auth.userId },
      data: { passwordHash: await hashPassword(newPassword) },
    });

    return NextResponse.json({ message: "Password updated." });
  } catch (err) {
    return handleApiError(err);
  }
}